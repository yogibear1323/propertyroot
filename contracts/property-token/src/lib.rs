//! PropertyRoot — pRT-<id> property-value token (TESTNET DEMO, UNAUDITED).
//! SEP-41 token interface. 1 pRT = 1 USD of LTV-capped appraised value (7 decimals).
//! Only the admin (the property vault) can mint. Represents a demo claim on
//! appraised value — NOT legal title to any property.
#![no_std]
use soroban_sdk::{contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, Address, Env, MuxedAddress, String};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error { Insufficient = 1, Allowance = 2, Negative = 3, Expired = 4 }

#[contracttype]
#[derive(Clone)]
enum Key { Admin, Name, Symbol, Supply, Bal(Address), Allow(Address, Address) }

#[contracttype]
#[derive(Clone)]
pub struct AllowanceValue { pub amount: i128, pub expiration_ledger: u32 }

#[contractevent(topics = ["transfer"], data_format = "single-value")]
pub struct Transfer { #[topic] pub from: Address, #[topic] pub to: Address, pub amount: i128 }
#[contractevent(topics = ["mint"], data_format = "single-value")]
pub struct Mint { #[topic] pub to: Address, pub amount: i128 }
#[contractevent(topics = ["burn"], data_format = "single-value")]
pub struct Burn { #[topic] pub from: Address, pub amount: i128 }
#[contractevent(topics = ["approve"])]
pub struct Approve { #[topic] pub from: Address, #[topic] pub spender: Address, pub amount: i128, pub expiration_ledger: u32 }

#[contract]
pub struct PropertyToken;

fn bal(e: &Env, a: &Address) -> i128 { e.storage().persistent().get(&Key::Bal(a.clone())).unwrap_or(0) }
fn set_bal(e: &Env, a: &Address, v: i128) {
    let k = Key::Bal(a.clone());
    e.storage().persistent().set(&k, &v);
    e.storage().persistent().extend_ttl(&k, 100_000, 500_000);
}
fn pos(e: &Env, v: i128) { if v < 0 { panic_with_error!(e, Error::Negative) } }
fn move_(e: &Env, from: &Address, to: &Address, amt: i128) {
    pos(e, amt);
    let fb = bal(e, from);
    if fb < amt { panic_with_error!(e, Error::Insufficient) }
    set_bal(e, from, fb - amt);
    set_bal(e, to, bal(e, to) + amt);
}
fn allowance_of(e: &Env, from: &Address, sp: &Address) -> i128 {
    match e.storage().temporary().get::<_, AllowanceValue>(&Key::Allow(from.clone(), sp.clone())) {
        Some(a) if a.expiration_ledger >= e.ledger().sequence() => a.amount,
        _ => 0,
    }
}
fn spend(e: &Env, from: &Address, sp: &Address, amt: i128) {
    let k = Key::Allow(from.clone(), sp.clone());
    let a: AllowanceValue = e.storage().temporary().get(&k).unwrap_or(AllowanceValue { amount: 0, expiration_ledger: 0 });
    if a.expiration_ledger < e.ledger().sequence() || a.amount < amt { panic_with_error!(e, Error::Allowance) }
    e.storage().temporary().set(&k, &AllowanceValue { amount: a.amount - amt, expiration_ledger: a.expiration_ledger });
}
fn bump(e: &Env) { e.storage().instance().extend_ttl(100_000, 500_000); }

#[contractimpl]
impl PropertyToken {
    pub fn __constructor(e: Env, admin: Address, name: String, symbol: String) {
        let s = e.storage().instance();
        s.set(&Key::Admin, &admin); s.set(&Key::Name, &name); s.set(&Key::Symbol, &symbol); s.set(&Key::Supply, &0i128);
    }
    pub fn mint(e: Env, to: Address, amount: i128) {
        let admin: Address = e.storage().instance().get(&Key::Admin).unwrap();
        admin.require_auth();
        pos(&e, amount);
        set_bal(&e, &to, bal(&e, &to) + amount);
        let s: i128 = e.storage().instance().get(&Key::Supply).unwrap();
        e.storage().instance().set(&Key::Supply, &(s + amount));
        bump(&e);
        Mint { to, amount }.publish(&e);
    }
    pub fn admin(e: Env) -> Address { e.storage().instance().get(&Key::Admin).unwrap() }
    pub fn total_supply(e: Env) -> i128 { e.storage().instance().get(&Key::Supply).unwrap() }

    // ---- SEP-41 ----
    pub fn allowance(e: Env, from: Address, spender: Address) -> i128 { allowance_of(&e, &from, &spender) }
    pub fn approve(e: Env, from: Address, spender: Address, amount: i128, expiration_ledger: u32) {
        from.require_auth();
        pos(&e, amount);
        if amount > 0 && expiration_ledger < e.ledger().sequence() { panic_with_error!(&e, Error::Expired) }
        let k = Key::Allow(from.clone(), spender.clone());
        e.storage().temporary().set(&k, &AllowanceValue { amount, expiration_ledger });
        if amount > 0 {
            let live = expiration_ledger.saturating_sub(e.ledger().sequence());
            e.storage().temporary().extend_ttl(&k, live, live);
        }
        Approve { from, spender, amount, expiration_ledger }.publish(&e);
    }
    pub fn balance(e: Env, id: Address) -> i128 { bal(&e, &id) }
    pub fn transfer(e: Env, from: Address, to: MuxedAddress, amount: i128) {
        from.require_auth();
        let to = to.address();
        move_(&e, &from, &to, amount);
        bump(&e);
        Transfer { from, to, amount }.publish(&e);
    }
    pub fn transfer_from(e: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        spend(&e, &from, &spender, amount);
        move_(&e, &from, &to, amount);
        bump(&e);
        Transfer { from, to, amount }.publish(&e);
    }
    pub fn burn(e: Env, from: Address, amount: i128) {
        from.require_auth();
        Self::burn_inner(&e, &from, amount);
    }
    pub fn burn_from(e: Env, spender: Address, from: Address, amount: i128) {
        spender.require_auth();
        spend(&e, &from, &spender, amount);
        Self::burn_inner(&e, &from, amount);
    }
    pub fn decimals(_e: Env) -> u32 { 7 }
    pub fn name(e: Env) -> String { e.storage().instance().get(&Key::Name).unwrap() }
    pub fn symbol(e: Env) -> String { e.storage().instance().get(&Key::Symbol).unwrap() }
}

impl PropertyToken {
    fn burn_inner(e: &Env, from: &Address, amount: i128) {
        pos(e, amount);
        let b = bal(e, from);
        if b < amount { panic_with_error!(e, Error::Insufficient) }
        set_bal(e, from, b - amount);
        let s: i128 = e.storage().instance().get(&Key::Supply).unwrap();
        e.storage().instance().set(&Key::Supply, &(s - amount));
        Burn { from: from.clone(), amount }.publish(e);
    }
}
