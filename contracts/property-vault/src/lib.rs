//! PropertyRoot — property vault (TESTNET DEMO, UNAUDITED).
//!
//! 1. `tokenize`: reads the property's attestation and deploys a SEP-41 token
//!    `pRT-<id>`, minting `value_usd * ltv_bps / 10_000` to the owner (1 pRT = 1 USD).
//! 2. `revalue`: re-reads a newer attestation and mints any extra headroom (or
//!    records an over-cap shortfall that blocks new deployments).
//! 3. `put_to_work`: the owner escrows pRT; the vault converts that USD value to
//!    XLM at the Reflector XLM/USD price and supplies it from its demo liquidity
//!    reserve into Blend through the adapter (share-price auto-compounding).
//!    `withdraw` returns the pRT and pays the owner the lending interest earned.
//!
//! The demo liquidity reserve stands in for a real lender/credit line. Yield is
//! Blend lending interest, NOT property yield. pRT is NOT legal title.
#![no_std]
use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token, Address, BytesN, Env, String, Symbol,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error { NotOwner = 1, AlreadyTokenized = 2, NotTokenized = 3, NoPrice = 4, StalePrice = 5, ReserveLow = 6, OverCap = 7, BadAmount = 8, NoPosition = 9, Unverified = 10, BadLtv = 11 }

// ---- external interfaces ----
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Attestation { pub owner: Address, pub value_usd: i128, pub appraisal_hash: BytesN<32>, pub title_verified: bool, pub kyc_verified: bool, pub simulated: bool, pub version: u32, pub timestamp: u64 }
#[contractclient(name = "RegistryClient")]
pub trait Registry { fn get(env: Env, property_id: u64) -> Attestation; }

/// Reflector (SEP-40) types.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Asset { Stellar(Address), Other(Symbol) }
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceData { pub price: i128, pub timestamp: u64 }
#[contractclient(name = "ReflectorClient")]
pub trait Reflector {
    fn lastprice(env: Env, asset: Asset) -> Option<PriceData>;
    fn decimals(env: Env) -> u32;
}

#[contractclient(name = "AdapterClient")]
pub trait Adapter {
    fn deposit(env: Env, amount: i128) -> i128;
    fn withdraw(env: Env, shares: i128) -> i128;
    fn value_of(env: Env, shares: i128) -> i128;
    fn share_price(env: Env) -> i128;
}

#[contractclient(name = "PropertyTokenClient")]
pub trait PropertyTokenMint { fn mint(env: Env, to: Address, amount: i128); }

// ---- state ----
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Property {
    pub owner: Address,
    pub token: Address,
    pub value_usd: i128,
    pub att_version: u32,
    /// pRT minted so far (USD, 7 dp) = LTV-capped working value.
    pub minted: i128,
    /// pRT minted above the current cap after a downward revaluation.
    pub over_cap: i128,
    /// pRT escrowed in the vault and deployed to Blend.
    pub prt_working: i128,
    /// XLM sent to Blend for this property (principal).
    pub principal_xlm: i128,
    pub shares: i128,
    pub yield_paid_xlm: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PositionView { pub property: Property, pub value_xlm: i128, pub accrued_yield_xlm: i128, pub share_price: i128 }

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config { pub admin: Address, pub registry: Address, pub token_wasm: BytesN<32>, pub oracle: Address, pub xlm: Address, pub adapter: Address, pub ltv_bps: u32, pub max_price_age: u64, pub require_verified: bool }

#[contracttype]
#[derive(Clone)]
enum Key { Cfg, Prop(u64), Count }

#[contractevent(topics = ["tokenized"])]
pub struct Tokenized { #[topic] pub property_id: u64, pub token: Address, pub minted: i128 }
#[contractevent(topics = ["revalued"])]
pub struct Revalued { #[topic] pub property_id: u64, pub value_usd: i128, pub minted_delta: i128, pub over_cap: i128 }
#[contractevent(topics = ["working"])]
pub struct Working { #[topic] pub property_id: u64, pub prt: i128, pub xlm: i128, pub shares: i128, pub price: i128 }
#[contractevent(topics = ["withdrawn"])]
pub struct Withdrawn { #[topic] pub property_id: u64, pub xlm_back: i128, pub yield_xlm: i128 }

#[contract]
pub struct PropertyVault;

fn cfg(e: &Env) -> Config { e.storage().instance().get(&Key::Cfg).unwrap() }
fn prop(e: &Env, id: u64) -> Property { e.storage().persistent().get(&Key::Prop(id)).unwrap_or_else(|| panic_with_error!(e, Error::NotTokenized)) }
fn save(e: &Env, id: u64, p: &Property) {
    e.storage().persistent().set(&Key::Prop(id), p);
    e.storage().persistent().extend_ttl(&Key::Prop(id), 100_000, 500_000);
    e.storage().instance().extend_ttl(100_000, 500_000);
}
fn cap_of(c: &Config, value_usd: i128) -> i128 { value_usd * c.ltv_bps as i128 / 10_000 }

/// "pRT-<id>" / "PropertyRoot pRT-<id>" without alloc.
fn label(e: &Env, prefix: &[u8], id: u64) -> String {
    let mut buf = [0u8; 48];
    let mut n = 0;
    for b in prefix { buf[n] = *b; n += 1; }
    let mut digits = [0u8; 20];
    let mut d = 0;
    let mut v = id;
    loop { digits[d] = b'0' + (v % 10) as u8; d += 1; v /= 10; if v == 0 { break } }
    while d > 0 { d -= 1; buf[n] = digits[d]; n += 1; }
    String::from_bytes(e, &buf[..n])
}

#[contractimpl]
impl PropertyVault {
    pub fn __constructor(e: Env, admin: Address, registry: Address, token_wasm: BytesN<32>, oracle: Address, xlm: Address, adapter: Address, ltv_bps: u32, max_price_age: u64, require_verified: bool) {
        if ltv_bps == 0 || ltv_bps > 8_000 { panic_with_error!(&e, Error::BadLtv) }
        e.storage().instance().set(&Key::Cfg, &Config { admin, registry, token_wasm, oracle, xlm, adapter, ltv_bps, max_price_age, require_verified });
        e.storage().instance().set(&Key::Count, &0u32);
    }

    /// Step 2: mint the pRT-<id> token for an attested property. Returns the token address.
    pub fn tokenize(e: Env, owner: Address, property_id: u64) -> Address {
        owner.require_auth();
        let c = cfg(&e);
        if e.storage().persistent().has(&Key::Prop(property_id)) { panic_with_error!(&e, Error::AlreadyTokenized) }
        let a = RegistryClient::new(&e, &c.registry).get(&property_id);
        if a.owner != owner { panic_with_error!(&e, Error::NotOwner) }
        if c.require_verified && !(a.title_verified && a.kyc_verified) { panic_with_error!(&e, Error::Unverified) }
        let mut salt = [0u8; 32];
        salt[24..].copy_from_slice(&property_id.to_be_bytes());
        let me = e.current_contract_address();
        let token = e.deployer().with_current_contract(BytesN::from_array(&e, &salt))
            .deploy_v2(c.token_wasm.clone(), (me.clone(), label(&e, b"PropertyRoot pRT-", property_id), label(&e, b"pRT-", property_id)));
        let minted = cap_of(&c, a.value_usd);
        PropertyTokenClient::new(&e, &token).mint(&owner, &minted);
        let p = Property { owner, token: token.clone(), value_usd: a.value_usd, att_version: a.version, minted, over_cap: 0, prt_working: 0, principal_xlm: 0, shares: 0, yield_paid_xlm: 0 };
        save(&e, property_id, &p);
        let n: u32 = e.storage().instance().get(&Key::Count).unwrap_or(0);
        e.storage().instance().set(&Key::Count, &(n + 1));
        Tokenized { property_id, token: token.clone(), minted }.publish(&e);
        token
    }

    /// Re-read the latest attestation. Up: mint headroom to the owner. Down: record over-cap.
    pub fn revalue(e: Env, property_id: u64) -> i128 {
        let c = cfg(&e);
        let mut p = prop(&e, property_id);
        let a = RegistryClient::new(&e, &c.registry).get(&property_id);
        let cap = cap_of(&c, a.value_usd);
        let mut delta = 0;
        if cap > p.minted {
            delta = cap - p.minted;
            PropertyTokenClient::new(&e, &p.token).mint(&p.owner, &delta);
            p.minted = cap;
            p.over_cap = 0;
        } else {
            p.over_cap = p.minted - cap;
        }
        p.value_usd = a.value_usd;
        p.att_version = a.version;
        save(&e, property_id, &p);
        Revalued { property_id, value_usd: a.value_usd, minted_delta: delta, over_cap: p.over_cap }.publish(&e);
        delta
    }

    /// XLM/USD from Reflector: (price, decimals, timestamp). Panics if missing or stale.
    pub fn xlm_price(e: Env) -> (i128, u32, u64) {
        let c = cfg(&e);
        let o = ReflectorClient::new(&e, &c.oracle);
        let pd = o.lastprice(&Asset::Other(Symbol::new(&e, "XLM"))).unwrap_or_else(|| panic_with_error!(&e, Error::NoPrice));
        let now = e.ledger().timestamp();
        if pd.price <= 0 { panic_with_error!(&e, Error::NoPrice) }
        if now > pd.timestamp && now - pd.timestamp > c.max_price_age { panic_with_error!(&e, Error::StalePrice) }
        (pd.price, o.decimals(), pd.timestamp)
    }

    /// USD (7 dp) -> XLM stroops (7 dp) at the Reflector price.
    pub fn usd_to_xlm(e: Env, usd: i128) -> i128 {
        let (price, dec, _) = Self::xlm_price(e.clone());
        usd * 10i128.pow(dec) / price
    }

    /// Anyone can top up the demo liquidity reserve (stands in for a lender).
    pub fn fund_reserve(e: Env, from: Address, amount: i128) {
        from.require_auth();
        if amount <= 0 { panic_with_error!(&e, Error::BadAmount) }
        token::TokenClient::new(&e, &cfg(&e).xlm).transfer(&from, &e.current_contract_address(), &amount);
    }
    pub fn reserve(e: Env) -> i128 { token::TokenClient::new(&e, &cfg(&e).xlm).balance(&e.current_contract_address()) }

    /// Step 3: escrow `prt_amount` pRT and supply its XLM equivalent to Blend.
    pub fn put_to_work(e: Env, owner: Address, property_id: u64, prt_amount: i128) -> i128 {
        owner.require_auth();
        let c = cfg(&e);
        let mut p = prop(&e, property_id);
        if p.owner != owner { panic_with_error!(&e, Error::NotOwner) }
        if p.over_cap > 0 { panic_with_error!(&e, Error::OverCap) }
        if prt_amount <= 0 { panic_with_error!(&e, Error::BadAmount) }
        let me = e.current_contract_address();
        token::TokenClient::new(&e, &p.token).transfer(&owner, &me, &prt_amount);
        let (price, dec, _) = Self::xlm_price(e.clone());
        let xlm_amt = prt_amount * 10i128.pow(dec) / price;
        let xlm = token::TokenClient::new(&e, &c.xlm);
        if xlm.balance(&me) < xlm_amt { panic_with_error!(&e, Error::ReserveLow) }
        xlm.transfer(&me, &c.adapter, &xlm_amt);
        let shares = AdapterClient::new(&e, &c.adapter).deposit(&xlm_amt);
        p.prt_working += prt_amount;
        p.principal_xlm += xlm_amt;
        p.shares += shares;
        save(&e, property_id, &p);
        Working { property_id, prt: prt_amount, xlm: xlm_amt, shares, price }.publish(&e);
        shares
    }

    /// Close the working position: principal returns to the reserve, interest goes to the
    /// owner in XLM, and the escrowed pRT is returned. Returns the yield paid.
    pub fn withdraw(e: Env, owner: Address, property_id: u64) -> i128 {
        owner.require_auth();
        let c = cfg(&e);
        let mut p = prop(&e, property_id);
        if p.owner != owner { panic_with_error!(&e, Error::NotOwner) }
        if p.shares == 0 { panic_with_error!(&e, Error::NoPosition) }
        let back = AdapterClient::new(&e, &c.adapter).withdraw(&p.shares);
        let y = if back > p.principal_xlm { back - p.principal_xlm } else { 0 };
        let me = e.current_contract_address();
        if y > 0 { token::TokenClient::new(&e, &c.xlm).transfer(&me, &owner, &y); }
        token::TokenClient::new(&e, &p.token).transfer(&me, &owner, &p.prt_working);
        p.prt_working = 0; p.principal_xlm = 0; p.shares = 0; p.yield_paid_xlm += y;
        save(&e, property_id, &p);
        Withdrawn { property_id, xlm_back: back, yield_xlm: y }.publish(&e);
        y
    }

    pub fn property(e: Env, property_id: u64) -> Property { prop(&e, property_id) }
    pub fn is_tokenized(e: Env, property_id: u64) -> bool { e.storage().persistent().has(&Key::Prop(property_id)) }
    pub fn position(e: Env, property_id: u64) -> PositionView {
        let c = cfg(&e);
        let p = prop(&e, property_id);
        let ad = AdapterClient::new(&e, &c.adapter);
        let v = if p.shares > 0 { ad.value_of(&p.shares) } else { 0 };
        let y = if v > p.principal_xlm { v - p.principal_xlm } else { 0 };
        PositionView { property: p, value_xlm: v, accrued_yield_xlm: y, share_price: ad.share_price() }
    }
    pub fn config(e: Env) -> Config { cfg(&e) }
    pub fn count(e: Env) -> u32 { e.storage().instance().get(&Key::Count).unwrap_or(0) }

    /// Admin: rotate the oracle (e.g. a different Reflector feed) or LTV for new tokenizations.
    pub fn set_params(e: Env, oracle: Address, ltv_bps: u32, max_price_age: u64) {
        let mut c = cfg(&e);
        c.admin.require_auth();
        if ltv_bps == 0 || ltv_bps > 8_000 { panic_with_error!(&e, Error::BadLtv) }
        c.oracle = oracle; c.ltv_bps = ltv_bps; c.max_price_age = max_price_age;
        e.storage().instance().set(&Key::Cfg, &c);
    }
}

