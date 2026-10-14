use propertyroot_attestation_registry::{AttestationRegistry, AttestationRegistryClient};
use propertyroot_blend_adapter::{BlendAdapter, BlendAdapterClient};
use propertyroot_mocks::{MockBlendPool, MockBlendPoolClient, MockReflector, MockReflectorClient};
use propertyroot_property_vault::{PropertyVault, PropertyVaultClient};
use soroban_sdk::{testutils::{Address as _, Ledger}, token, Address, BytesN, Env, String};

mod ptoken { soroban_sdk::contractimport!(file = "../../target/wasm32v1-none/release/propertyroot_property_token.wasm"); }

const USD: i128 = 10_000_000;

struct T<'a> { e: Env, owner: Address, appraiser: Address, reg: AttestationRegistryClient<'a>, vault: PropertyVaultClient<'a>, adapter: BlendAdapterClient<'a>, pool: MockBlendPoolClient<'a>, sa: token::StellarAssetClient<'a>, oracle: MockReflectorClient<'a>, xlm: token::Client<'a> }

fn setup(require_verified: bool) -> T<'static> {
    let e = Env::default();
    e.mock_all_auths();
    e.ledger().set_timestamp(1_000_000);
    let admin = Address::generate(&e);
    let appraiser = Address::generate(&e);
    let owner = Address::generate(&e);
    let sac = e.register_stellar_asset_contract_v2(admin.clone());
    let xlm_addr = sac.address();
    let reg = AttestationRegistryClient::new(&e, &e.register(AttestationRegistry, (admin.clone(), appraiser.clone(), true, 2_000_000 * USD)));
    let pool = MockBlendPoolClient::new(&e, &e.register(MockBlendPool, (xlm_addr.clone(),)));
    let oracle = MockReflectorClient::new(&e, &e.register(MockReflector, ()));
    oracle.set(&(20_000_000_000_000i128), &1_000_000); // $0.20, 14 dp
    let adapter = BlendAdapterClient::new(&e, &e.register(BlendAdapter, (admin.clone(), admin.clone(), pool.address.clone(), xlm_addr.clone())));
    let wasm = e.deployer().upload_contract_wasm(ptoken::WASM);
    let vault = PropertyVaultClient::new(&e, &e.register(PropertyVault, (admin.clone(), reg.address.clone(), wasm, oracle.address.clone(), xlm_addr.clone(), adapter.address.clone(), 5_000u32, 3_600u64, require_verified)));
    adapter.set_vault(&vault.address);
    let sa = token::StellarAssetClient::new(&e, &xlm_addr);
    sa.mint(&admin, &(1_000_000 * USD));
    vault.fund_reserve(&admin, &(100_000 * USD));
    sa.mint(&pool.address, &(10_000 * USD)); // pre-funded interest liquidity in the mock pool
    T { e: e.clone(), owner, appraiser, reg, vault, adapter, pool, sa, oracle, xlm: token::Client::new(&e, &xlm_addr) }
}

fn h(e: &Env, b: u8) -> BytesN<32> { BytesN::from_array(e, &[b; 32]) }

#[test]
fn full_flow_appraise_tokenize_earn() {
    let t = setup(true);
    // 1. appraise (appraiser-signed)
    assert_eq!(t.reg.attest(&1, &t.owner, &(300_000 * USD), &h(&t.e, 1), &true, &true), 1);
    let a = t.reg.get(&1);
    assert!(!a.simulated && a.title_verified);
    // 2. tokenize at 50% LTV
    let tok = t.vault.tokenize(&t.owner, &1);
    let prt = ptoken::Client::new(&t.e, &tok);
    assert_eq!(prt.symbol(), String::from_str(&t.e, "pRT-1"));
    assert_eq!(prt.name(), String::from_str(&t.e, "PropertyRoot pRT-1"));
    assert_eq!(prt.decimals(), 7);
    assert_eq!(prt.balance(&t.owner), 150_000 * USD);
    // conversion via oracle: $1,000 at $0.20 = 5,000 XLM
    assert_eq!(t.vault.usd_to_xlm(&(1_000 * USD)), 5_000 * USD);
    // 3. put $1,000 of pRT to work
    let shares = t.vault.put_to_work(&t.owner, &1, &(1_000 * USD));
    assert_eq!(shares, 5_000 * USD);
    assert_eq!(prt.balance(&t.owner), 149_000 * USD);
    assert_eq!(t.vault.reserve(), 95_000 * USD);
    // interest accrues: b_rate +2% -> compounding share price
    t.pool.set_b_rate(&1_020_000_000_000);
    let pos = t.vault.position(&1);
    assert_eq!(pos.value_xlm, 5_100 * USD);
    assert_eq!(pos.accrued_yield_xlm, 100 * USD);
    assert_eq!(pos.share_price, 10_200_000);
    t.pool.set_b_rate(&1_040_400_000_000); // compounds on top
    assert_eq!(t.vault.position(&1).accrued_yield_xlm, 202 * USD);
    let y = t.vault.withdraw(&t.owner, &1);
    assert_eq!(y, 202 * USD);
    assert_eq!(t.xlm.balance(&t.owner), 202 * USD);
    assert_eq!(prt.balance(&t.owner), 150_000 * USD);
    assert_eq!(t.vault.reserve(), 100_000 * USD);
    assert_eq!(t.adapter.total_shares(), 0);
}

#[test]
fn revalue_up_mints_down_blocks() {
    let t = setup(true);
    t.reg.attest(&7, &t.owner, &(200_000 * USD), &h(&t.e, 1), &true, &true);
    let tok = t.vault.tokenize(&t.owner, &7);
    let prt = ptoken::Client::new(&t.e, &tok);
    t.reg.attest(&7, &t.owner, &(240_000 * USD), &h(&t.e, 2), &true, &true);
    assert_eq!(t.vault.revalue(&7), 20_000 * USD);
    assert_eq!(prt.balance(&t.owner), 120_000 * USD);
    t.reg.attest(&7, &t.owner, &(180_000 * USD), &h(&t.e, 3), &true, &true);
    assert_eq!(t.vault.revalue(&7), 0);
    assert_eq!(t.vault.property(&7).over_cap, 30_000 * USD);
    assert!(t.vault.try_put_to_work(&t.owner, &7, &USD).is_err());
}

#[test]
fn self_attest_demo_mode_and_caps() {
    let t = setup(true);
    assert_eq!(t.reg.self_attest(&3, &t.owner, &(400_000 * USD), &h(&t.e, 9)), 1);
    assert!(t.reg.get(&3).simulated);
    assert!(t.reg.try_self_attest(&4, &t.owner, &(3_000_000 * USD), &h(&t.e, 9)).is_err());
    t.vault.tokenize(&t.owner, &3);
    assert!(t.vault.try_tokenize(&t.owner, &3).is_err());
    t.reg.set_demo_mode(&false);
    assert!(t.reg.try_self_attest(&5, &t.owner, &USD, &h(&t.e, 9)).is_err());
    let _ = &t.appraiser;
}

#[test]
fn wrong_owner_unverified_and_stale_oracle() {
    let t = setup(true);
    let other = Address::generate(&t.e);
    t.reg.attest(&1, &t.owner, &(100_000 * USD), &h(&t.e, 1), &false, &true);
    assert!(t.vault.try_tokenize(&other, &1).is_err());
    assert!(t.vault.try_tokenize(&t.owner, &1).is_err()); // title unverified
    t.reg.attest(&1, &t.owner, &(100_000 * USD), &h(&t.e, 1), &true, &true);
    t.vault.tokenize(&t.owner, &1);
    assert!(t.vault.try_put_to_work(&other, &1, &USD).is_err());
    t.e.ledger().set_timestamp(1_000_000 + 7_200);
    assert!(t.vault.try_put_to_work(&t.owner, &1, &USD).is_err()); // stale price
    t.oracle.set(&20_000_000_000_000, &(1_000_000 + 7_000));
    assert!(t.vault.try_put_to_work(&t.owner, &1, &(1_000_000 * USD)).is_err()); // reserve low
    t.vault.put_to_work(&t.owner, &1, &(100 * USD));
}

#[test]
fn shares_fair_between_deposits() {
    let t = setup(false);
    let o2 = Address::generate(&t.e);
    t.reg.attest(&1, &t.owner, &(100_000 * USD), &h(&t.e, 1), &true, &true);
    t.reg.attest(&2, &o2, &(100_000 * USD), &h(&t.e, 2), &true, &true);
    t.vault.tokenize(&t.owner, &1);
    t.vault.tokenize(&o2, &2);
    t.vault.put_to_work(&t.owner, &1, &(1_000 * USD));
    t.pool.set_b_rate(&1_100_000_000_000);
    t.vault.put_to_work(&o2, &2, &(1_000 * USD));
    assert_eq!(t.vault.position(&2).accrued_yield_xlm, 0);
    assert!((t.vault.position(&1).accrued_yield_xlm - 500 * USD).abs() <= 2);
    assert!((t.vault.withdraw(&t.owner, &1) - 500 * USD).abs() <= 2);
    let _ = &t.sa;
    assert!(t.vault.withdraw(&o2, &2) <= 1);
}
