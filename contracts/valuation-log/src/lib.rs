//! PropertyRoot — valuation log (TESTNET DEMO, UNAUDITED).
//! Owner-signed record of a property's base value and where it came from.
//! Stores sha256(normalized address), never the plain address.
//! `source` is `rentcast` (RentCast AVM), `zillow` (legacy) or `manual` (typed by the user).
//! `response_hash` is sha256 of the provider's raw JSON response (all-zero for manual).
#![no_std]
use soroban_sdk::{contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, symbol_short, Address, BytesN, Env, Symbol};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error { NotFound = 1, BadValue = 2, BadSource = 3, WrongOwner = 4, BadSplit = 5 }

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Valuation {
    pub owner: Address,
    pub address_hash: BytesN<32>,
    /// USD with 7 decimals.
    pub value_usd: i128,
    pub source: Symbol,
    pub response_hash: BytesN<32>,
    /// Ledger timestamp when recorded (seconds).
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone)]
enum Key { Next, Val(u64), Latest(Address), Tok(u64) }

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Tokenization {
    pub valuation_id: u64,
    /// Whole tokens.
    pub supply: i128,
    /// USD per token, 7 decimals.
    pub price_usd: i128,
    pub timestamp: u64,
}

#[contractevent(topics = ["valued"])]
pub struct Valued { #[topic] pub id: u64, #[topic] pub owner: Address, pub value_usd: i128, pub source: Symbol }

#[contract]
pub struct ValuationLog;

#[contractimpl]
impl ValuationLog {
    /// Record a valuation signed by `owner`. Returns the valuation id.
    pub fn record_valuation(e: Env, owner: Address, address_hash: BytesN<32>, value_usd: i128, source: Symbol, response_hash: BytesN<32>) -> u64 {
        owner.require_auth();
        if value_usd <= 0 { panic_with_error!(&e, Error::BadValue) }
        if source != Symbol::new(&e, "rentcast") && source != symbol_short!("zillow") && source != symbol_short!("manual") { panic_with_error!(&e, Error::BadSource) }
        let id: u64 = e.storage().instance().get(&Key::Next).unwrap_or(1);
        e.storage().instance().set(&Key::Next, &(id + 1));
        let v = Valuation { owner: owner.clone(), address_hash, value_usd, source: source.clone(), response_hash, timestamp: e.ledger().timestamp() };
        e.storage().persistent().set(&Key::Val(id), &v);
        e.storage().persistent().extend_ttl(&Key::Val(id), 100_000, 500_000);
        e.storage().persistent().set(&Key::Latest(owner.clone()), &id);
        e.storage().persistent().extend_ttl(&Key::Latest(owner.clone()), 100_000, 500_000);
        e.storage().instance().extend_ttl(100_000, 500_000);
        Valued { id, owner, value_usd, source }.publish(&e);
        id
    }
    /// Record a token split for a valuation the caller owns. supply*price must not exceed the value.
    pub fn record_tokenization(e: Env, owner: Address, valuation_id: u64, supply: i128, price_usd: i128) -> Tokenization {
        owner.require_auth();
        let v: Valuation = e.storage().persistent().get(&Key::Val(valuation_id)).unwrap_or_else(|| panic_with_error!(&e, Error::NotFound));
        if v.owner != owner { panic_with_error!(&e, Error::WrongOwner) }
        if supply < 1 || price_usd < 1 || supply.checked_mul(price_usd).map_or(true, |t| t > v.value_usd) { panic_with_error!(&e, Error::BadSplit) }
        let t = Tokenization { valuation_id, supply, price_usd, timestamp: e.ledger().timestamp() };
        e.storage().persistent().set(&Key::Tok(valuation_id), &t);
        e.storage().persistent().extend_ttl(&Key::Tok(valuation_id), 100_000, 500_000);
        t
    }
    pub fn tokenization(e: Env, valuation_id: u64) -> Option<Tokenization> { e.storage().persistent().get(&Key::Tok(valuation_id)) }
    pub fn get(e: Env, id: u64) -> Valuation { e.storage().persistent().get(&Key::Val(id)).unwrap_or_else(|| panic_with_error!(&e, Error::NotFound)) }
    pub fn latest(e: Env, owner: Address) -> Option<u64> { e.storage().persistent().get(&Key::Latest(owner)) }
    pub fn next_id(e: Env) -> u64 { e.storage().instance().get(&Key::Next).unwrap_or(1) }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, Env};
    #[test]
    fn records_and_reads() {
        let e = Env::default(); e.mock_all_auths();
        let id = e.register(ValuationLog, ());
        let c = ValuationLogClient::new(&e, &id);
        let o = Address::generate(&e);
        let h = BytesN::from_array(&e, &[7u8; 32]);
        let n = c.record_valuation(&o, &h, &4_500_000_000_000, &symbol_short!("manual"), &h);
        assert_eq!(c.record_valuation(&o, &h, &1, &Symbol::new(&e, "rentcast"), &h), 2);
        assert_eq!(n, 1);
        let v = c.get(&1);
        assert_eq!(v.value_usd, 4_500_000_000_000); assert_eq!(v.source, symbol_short!("manual"));
        assert_eq!(c.latest(&o), Some(2));
        assert!(c.try_record_valuation(&o, &h, &1, &symbol_short!("fake"), &h).is_err());
        let t = c.record_tokenization(&o, &1, &450_000, &10_000_000);
        assert_eq!(t.supply, 450_000); assert_eq!(c.tokenization(&1).unwrap().price_usd, 10_000_000);
        assert!(c.try_record_tokenization(&o, &1, &450_001, &10_000_000).is_err());
        assert!(c.try_record_tokenization(&Address::generate(&e), &1, &1, &1).is_err());
        assert!(c.try_record_valuation(&o, &h, &0, &symbol_short!("zillow"), &h).is_err());
    }
}
