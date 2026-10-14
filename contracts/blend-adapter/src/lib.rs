//! PropertyRoot — Blend adapter (TESTNET DEMO, UNAUDITED).
//! Supplies XLM from the property vault into a Blend v2 pool (request type 0,
//! non-collateral supply) and tracks vault shares with a share-price model.
//! Yield compounds automatically: Blend's bToken rate (`b_rate`) grows as
//! borrowers pay interest, so each share is worth more XLM over time.
//! This is LENDING yield earned from Blend borrowers — not property yield.
#![no_std]
use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token, vec, Address, Env, IntoVal, Map, Symbol, Vec,
};

pub const SCALAR_12: i128 = 1_000_000_000_000;
pub const SCALAR_7: i128 = 10_000_000;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error { BadAmount = 1, NoShares = 2 }

// ---- Blend v2 pool types (subset, field names must match the pool) ----
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Request { pub request_type: u32, pub address: Address, pub amount: i128 }
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Positions { pub collateral: Map<u32, i128>, pub liabilities: Map<u32, i128>, pub supply: Map<u32, i128> }
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReserveConfig { pub c_factor: u32, pub decimals: u32, pub enabled: bool, pub index: u32, pub l_factor: u32, pub max_util: u32, pub r_base: u32, pub r_one: u32, pub r_three: u32, pub r_two: u32, pub reactivity: u32, pub supply_cap: i128, pub util: u32 }
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReserveData { pub b_rate: i128, pub b_supply: i128, pub backstop_credit: i128, pub d_rate: i128, pub d_supply: i128, pub ir_mod: i128, pub last_time: u64 }
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Reserve { pub asset: Address, pub config: ReserveConfig, pub data: ReserveData, pub scalar: i128 }

#[contractclient(name = "BlendPoolClient")]
pub trait BlendPool {
    fn submit(env: Env, from: Address, spender: Address, to: Address, requests: Vec<Request>) -> Positions;
    fn get_positions(env: Env, address: Address) -> Positions;
    fn get_reserve(env: Env, asset: Address) -> Reserve;
}

#[contracttype]
#[derive(Clone)]
enum Key { Admin, Vault, Pool, Asset, Shares, Principal }

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdapterState { pub pool: Address, pub asset: Address, pub b_tokens: i128, pub b_rate: i128, pub total_value: i128, pub total_shares: i128, pub share_price: i128, pub principal: i128 }

#[contractevent(topics = ["supplied"])]
pub struct Supplied { pub amount: i128, pub shares: i128 }
#[contractevent(topics = ["withdrawn"])]
pub struct Withdrawn { pub shares: i128, pub amount: i128 }

#[contract]
pub struct BlendAdapter;

fn g<T: soroban_sdk::TryFromVal<Env, soroban_sdk::Val>>(e: &Env, k: &Key) -> T { e.storage().instance().get(k).unwrap() }
fn pool(e: &Env) -> BlendPoolClient<'_> { BlendPoolClient::new(e, &g::<Address>(e, &Key::Pool)) }

fn reserve_index_and_rate(e: &Env) -> (u32, i128) {
    let r = pool(e).get_reserve(&g::<Address>(e, &Key::Asset));
    (r.config.index, r.data.b_rate)
}
fn b_tokens(e: &Env, index: u32) -> i128 { pool(e).get_positions(&e.current_contract_address()).supply.get(index).unwrap_or(0) }
fn value(e: &Env) -> (i128, i128, i128) {
    let (idx, rate) = reserve_index_and_rate(e);
    let bt = b_tokens(e, idx);
    (bt * rate / SCALAR_12, bt, rate)
}

#[contractimpl]
impl BlendAdapter {
    pub fn __constructor(e: Env, admin: Address, vault: Address, pool: Address, asset: Address) {
        let s = e.storage().instance();
        s.set(&Key::Admin, &admin); s.set(&Key::Vault, &vault); s.set(&Key::Pool, &pool); s.set(&Key::Asset, &asset);
        s.set(&Key::Shares, &0i128); s.set(&Key::Principal, &0i128);
    }

    /// Vault only. `amount` of the asset is already held by this adapter; supply it to Blend.
    /// Returns shares minted at the current share price.
    pub fn deposit(e: Env, amount: i128) -> i128 {
        g::<Address>(&e, &Key::Vault).require_auth();
        if amount <= 0 { panic_with_error!(&e, Error::BadAmount) }
        let (before, _, _) = value(&e);
        let total: i128 = g(&e, &Key::Shares);
        let shares = if total == 0 || before == 0 { amount } else { amount * total / before };
        let me = e.current_contract_address();
        let p: Address = g(&e, &Key::Pool);
        let asset: Address = g(&e, &Key::Asset);
        e.authorize_as_current_contract(vec![&e, InvokerContractAuthEntry::Contract(SubContractInvocation {
            context: ContractContext { contract: asset.clone(), fn_name: Symbol::new(&e, "transfer"), args: (me.clone(), p.clone(), amount).into_val(&e) },
            sub_invocations: vec![&e],
        })]);
        pool(&e).submit(&me, &me, &me, &vec![&e, Request { request_type: 0, address: asset, amount }]);
        e.storage().instance().set(&Key::Shares, &(total + shares));
        let pr: i128 = g(&e, &Key::Principal);
        e.storage().instance().set(&Key::Principal, &(pr + amount));
        e.storage().instance().extend_ttl(100_000, 500_000);
        Supplied { amount, shares }.publish(&e);
        shares
    }

    /// Vault only. Redeem `shares` from Blend and send the asset to the vault. Returns amount sent.
    pub fn withdraw(e: Env, shares: i128) -> i128 {
        let vault: Address = g(&e, &Key::Vault);
        vault.require_auth();
        let total: i128 = g(&e, &Key::Shares);
        if shares <= 0 || shares > total { panic_with_error!(&e, Error::NoShares) }
        let (val, _, _) = value(&e);
        let me = e.current_contract_address();
        let asset: Address = g(&e, &Key::Asset);
        let tok = token::TokenClient::new(&e, &asset);
        let pre = tok.balance(&me);
        // Last holder takes everything (Blend caps an oversized withdraw at the full position).
        let want = if shares == total { val + val / 1000 + 1 } else { shares * val / total };
        if want > 0 { pool(&e).submit(&me, &me, &me, &vec![&e, Request { request_type: 1, address: asset, amount: want }]); }
        let got = tok.balance(&me) - pre;
        if got > 0 { tok.transfer(&me, &vault, &got); }
        let pr: i128 = g(&e, &Key::Principal);
        let pr_out = pr * shares / total;
        e.storage().instance().set(&Key::Principal, &(pr - pr_out));
        e.storage().instance().set(&Key::Shares, &(total - shares));
        e.storage().instance().extend_ttl(100_000, 500_000);
        Withdrawn { shares, amount: got }.publish(&e);
        got
    }

    pub fn total_value(e: Env) -> i128 { value(&e).0 }
    pub fn total_shares(e: Env) -> i128 { g(&e, &Key::Shares) }
    /// Asset per share, 7 decimals (1_0000000 at start; grows as Blend interest accrues).
    pub fn share_price(e: Env) -> i128 {
        let t: i128 = g(&e, &Key::Shares);
        if t == 0 { return SCALAR_7 }
        value(&e).0 * SCALAR_7 / t
    }
    pub fn value_of(e: Env, shares: i128) -> i128 {
        let t: i128 = g(&e, &Key::Shares);
        if t == 0 { 0 } else { shares * value(&e).0 / t }
    }
    pub fn state(e: Env) -> AdapterState {
        let (v, bt, rate) = value(&e);
        let t: i128 = g(&e, &Key::Shares);
        AdapterState { pool: g(&e, &Key::Pool), asset: g(&e, &Key::Asset), b_tokens: bt, b_rate: rate, total_value: v, total_shares: t, share_price: if t == 0 { SCALAR_7 } else { v * SCALAR_7 / t }, principal: g(&e, &Key::Principal) }
    }
    /// Admin: point at the vault once it is deployed (vault and adapter reference each other).
    pub fn set_vault(e: Env, vault: Address) {
        g::<Address>(&e, &Key::Admin).require_auth();
        e.storage().instance().set(&Key::Vault, &vault);
    }
    pub fn vault(e: Env) -> Address { g(&e, &Key::Vault) }
}
