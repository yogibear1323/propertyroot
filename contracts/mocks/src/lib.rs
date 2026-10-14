//! Test-only mocks of the Blend v2 pool and Reflector oracle interfaces (never deployed).
#![no_std]
use crate::propertyroot_blend_adapter_types::*;
use soroban_sdk::{contract, contractimpl, contracttype, map, token, Address, Env, Map, Symbol, Vec};

pub mod propertyroot_blend_adapter_types {
    use soroban_sdk::{contracttype, Address, Map, Symbol};
    #[contracttype] #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct Request { pub request_type: u32, pub address: Address, pub amount: i128 }
    #[contracttype] #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct Positions { pub collateral: Map<u32, i128>, pub liabilities: Map<u32, i128>, pub supply: Map<u32, i128> }
    #[contracttype] #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct ReserveConfig { pub c_factor: u32, pub decimals: u32, pub enabled: bool, pub index: u32, pub l_factor: u32, pub max_util: u32, pub r_base: u32, pub r_one: u32, pub r_three: u32, pub r_two: u32, pub reactivity: u32, pub supply_cap: i128, pub util: u32 }
    #[contracttype] #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct ReserveData { pub b_rate: i128, pub b_supply: i128, pub backstop_credit: i128, pub d_rate: i128, pub d_supply: i128, pub ir_mod: i128, pub last_time: u64 }
    #[contracttype] #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct Reserve { pub asset: Address, pub config: ReserveConfig, pub data: ReserveData, pub scalar: i128 }
    #[contracttype] #[derive(Clone, Debug, Eq, PartialEq)]
    pub enum Asset { Stellar(Address), Other(Symbol) }
    #[contracttype] #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct PriceData { pub price: i128, pub timestamp: u64 }
}

#[contracttype]
#[derive(Clone)]
enum K { Asset, Rate, B(Address), Price, Ts }

#[contract]
pub struct MockBlendPool;

#[contractimpl]
impl MockBlendPool {
    pub fn __constructor(e: Env, asset: Address) { e.storage().instance().set(&K::Asset, &asset); e.storage().instance().set(&K::Rate, &1_000_000_000_000i128); }
    pub fn set_b_rate(e: Env, rate: i128) { e.storage().instance().set(&K::Rate, &rate); }
    pub fn submit(e: Env, from: Address, _spender: Address, to: Address, requests: Vec<Request>) -> Positions {
        from.require_auth();
        let asset: Address = e.storage().instance().get(&K::Asset).unwrap();
        let rate: i128 = e.storage().instance().get(&K::Rate).unwrap();
        let tok = token::TokenClient::new(&e, &asset);
        let me = e.current_contract_address();
        for r in requests.iter() {
            let b: i128 = e.storage().instance().get(&K::B(from.clone())).unwrap_or(0);
            if r.request_type == 0 {
                tok.transfer(&from, &me, &r.amount);
                e.storage().instance().set(&K::B(from.clone()), &(b + r.amount * 1_000_000_000_000 / rate));
            } else {
                let mut bt = r.amount * 1_000_000_000_000 / rate;
                let mut amt = r.amount;
                if bt >= b { bt = b; amt = b * rate / 1_000_000_000_000; }
                e.storage().instance().set(&K::B(from.clone()), &(b - bt));
                tok.transfer(&me, &to, &amt);
            }
        }
        Self::get_positions(e, from)
    }
    pub fn get_positions(e: Env, address: Address) -> Positions {
        let b: i128 = e.storage().instance().get(&K::B(address)).unwrap_or(0);
        Positions { collateral: Map::new(&e), liabilities: Map::new(&e), supply: map![&e, (0u32, b)] }
    }
    pub fn get_reserve(e: Env, asset: Address) -> Reserve {
        let rate: i128 = e.storage().instance().get(&K::Rate).unwrap();
        Reserve { asset, config: ReserveConfig { c_factor: 0, decimals: 7, enabled: true, index: 0, l_factor: 0, max_util: 0, r_base: 0, r_one: 0, r_three: 0, r_two: 0, reactivity: 0, supply_cap: i128::MAX, util: 0 },
            data: ReserveData { b_rate: rate, b_supply: 0, backstop_credit: 0, d_rate: 0, d_supply: 0, ir_mod: 0, last_time: 0 }, scalar: 10_000_000 }
    }
}

#[contract]
pub struct MockReflector;

#[contractimpl]
impl MockReflector {
    pub fn set(e: Env, price: i128, ts: u64) { e.storage().instance().set(&K::Price, &price); e.storage().instance().set(&K::Ts, &ts); }
    pub fn lastprice(e: Env, asset: Asset) -> Option<PriceData> {
        match asset { Asset::Other(s) if s == Symbol::new(&e, "XLM") => {}, _ => return None }
        let p: Option<i128> = e.storage().instance().get(&K::Price);
        p.map(|price| PriceData { price, timestamp: e.storage().instance().get(&K::Ts).unwrap() })
    }
    pub fn decimals(_e: Env) -> u32 { 14 }
}
