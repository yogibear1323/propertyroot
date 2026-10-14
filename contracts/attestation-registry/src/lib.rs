//! PropertyRoot — attestation registry (TESTNET DEMO, UNAUDITED).
//! Records an appraisal hash + USD value for a property. Two kinds:
//!  * appraiser-signed (`attest`): signed by the registry's appraiser key;
//!  * simulated self-attestation (`self_attest`): signed by the owner, only
//!    while `demo_mode` is on, capped at `demo_cap_usd`, and flagged `simulated`.
//! An attestation is NOT legal title. Title/KYC flags are simulated in the demo.
#![no_std]
use soroban_sdk::{contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, Address, BytesN, Env};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error { NotFound = 1, WrongOwner = 2, BadValue = 3, DemoOff = 4, OverDemoCap = 5 }

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Attestation {
    pub owner: Address,
    /// Appraised value in USD with 7 decimals.
    pub value_usd: i128,
    /// sha256 of the off-chain appraisal document (simulated in the demo).
    pub appraisal_hash: BytesN<32>,
    pub title_verified: bool,
    pub kyc_verified: bool,
    /// true = owner self-attested in demo mode; false = appraiser key signed.
    pub simulated: bool,
    pub version: u32,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone)]
enum Key { Admin, Appraiser, DemoMode, DemoCap, Next, Att(u64) }

#[contractevent(topics = ["attested"])]
pub struct Attested { #[topic] pub property_id: u64, pub value_usd: i128, pub version: u32, pub simulated: bool }

#[contract]
pub struct AttestationRegistry;

fn get_att(e: &Env, id: u64) -> Option<Attestation> { e.storage().persistent().get(&Key::Att(id)) }

fn write(e: &Env, id: u64, owner: Address, value_usd: i128, hash: BytesN<32>, title: bool, kyc: bool, simulated: bool) -> u32 {
    if value_usd <= 0 { panic_with_error!(e, Error::BadValue) }
    let version = match get_att(e, id) {
        Some(prev) => { if prev.owner != owner { panic_with_error!(e, Error::WrongOwner) } prev.version + 1 }
        None => {
            let next: u64 = e.storage().instance().get(&Key::Next).unwrap_or(1);
            if id >= next { e.storage().instance().set(&Key::Next, &(id + 1)); }
            1
        }
    };
    let a = Attestation { owner, value_usd, appraisal_hash: hash, title_verified: title, kyc_verified: kyc, simulated, version, timestamp: e.ledger().timestamp() };
    e.storage().persistent().set(&Key::Att(id), &a);
    e.storage().persistent().extend_ttl(&Key::Att(id), 100_000, 500_000);
    e.storage().instance().extend_ttl(100_000, 500_000);
    Attested { property_id: id, value_usd, version, simulated }.publish(e);
    version
}

#[contractimpl]
impl AttestationRegistry {
    pub fn __constructor(e: Env, admin: Address, appraiser: Address, demo_mode: bool, demo_cap_usd: i128) {
        let s = e.storage().instance();
        s.set(&Key::Admin, &admin); s.set(&Key::Appraiser, &appraiser); s.set(&Key::DemoMode, &demo_mode); s.set(&Key::DemoCap, &demo_cap_usd); s.set(&Key::Next, &1u64);
    }

    /// Appraiser-signed attestation (create or revalue). Returns the version.
    pub fn attest(e: Env, property_id: u64, owner: Address, value_usd: i128, appraisal_hash: BytesN<32>, title_verified: bool, kyc_verified: bool) -> u32 {
        let appraiser: Address = e.storage().instance().get(&Key::Appraiser).unwrap();
        appraiser.require_auth();
        write(&e, property_id, owner, value_usd, appraisal_hash, title_verified, kyc_verified, false)
    }

    /// Demo-only simulated appraisal signed by the owner's own wallet.
    pub fn self_attest(e: Env, property_id: u64, owner: Address, value_usd: i128, appraisal_hash: BytesN<32>) -> u32 {
        owner.require_auth();
        if !e.storage().instance().get::<_, bool>(&Key::DemoMode).unwrap_or(false) { panic_with_error!(&e, Error::DemoOff) }
        let cap: i128 = e.storage().instance().get(&Key::DemoCap).unwrap();
        if value_usd > cap { panic_with_error!(&e, Error::OverDemoCap) }
        write(&e, property_id, owner, value_usd, appraisal_hash, true, true, true)
    }

    pub fn get(e: Env, property_id: u64) -> Attestation { get_att(&e, property_id).unwrap_or_else(|| panic_with_error!(&e, Error::NotFound)) }
    pub fn exists(e: Env, property_id: u64) -> bool { get_att(&e, property_id).is_some() }
    pub fn next_id(e: Env) -> u64 { e.storage().instance().get(&Key::Next).unwrap_or(1) }
    pub fn appraiser(e: Env) -> Address { e.storage().instance().get(&Key::Appraiser).unwrap() }
    pub fn demo_mode(e: Env) -> bool { e.storage().instance().get(&Key::DemoMode).unwrap_or(false) }
    pub fn demo_cap_usd(e: Env) -> i128 { e.storage().instance().get(&Key::DemoCap).unwrap() }

    pub fn set_demo_mode(e: Env, on: bool) {
        let a: Address = e.storage().instance().get(&Key::Admin).unwrap(); a.require_auth();
        e.storage().instance().set(&Key::DemoMode, &on);
    }
    pub fn set_appraiser(e: Env, appraiser: Address) {
        let a: Address = e.storage().instance().get(&Key::Admin).unwrap(); a.require_auth();
        e.storage().instance().set(&Key::Appraiser, &appraiser);
    }
}
