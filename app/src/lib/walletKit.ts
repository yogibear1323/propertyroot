/**
 * Multi-wallet layer on @creit.tech/stellar-wallets-kit, pinned to Stellar TESTNET.
 * The chosen wallet id + public address are kept in sessionStorage only (never keys).
 */
import { StellarWalletsKit } from "@creit.tech/stellar-wallets-kit/sdk";
import { Networks, type ISupportedWallet } from "@creit.tech/stellar-wallets-kit/types";
import { FreighterModule, FREIGHTER_ID } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { LobstrModule, LOBSTR_ID } from "@creit.tech/stellar-wallets-kit/modules/lobstr";
import { xBullModule, XBULL_ID } from "@creit.tech/stellar-wallets-kit/modules/xbull";
import { AlbedoModule, ALBEDO_ID } from "@creit.tech/stellar-wallets-kit/modules/albedo";
import { RabetModule, RABET_ID } from "@creit.tech/stellar-wallets-kit/modules/rabet";
import { HanaModule, HANA_ID } from "@creit.tech/stellar-wallets-kit/modules/hana";
import { ScopulyModule, SCOPULY_ID } from "@creit.tech/stellar-wallets-kit/modules/scopuly";
import { NETWORK_PASSPHRASE } from "./config";
import type { Signer } from "./signer";

export const WALLET_ORDER = [FREIGHTER_ID, LOBSTR_ID, XBULL_ID, ALBEDO_ID, RABET_ID, HANA_ID, SCOPULY_ID];
const SESSION_KEY = "propertyroot.wallet.v1";

let inited = false;
function kit() {
  if (!inited) {
    StellarWalletsKit.init({
      network: Networks.TESTNET,
      modules: [new FreighterModule(), new LobstrModule(), new xBullModule(), new AlbedoModule(), new RabetModule(), new HanaModule(), new ScopulyModule()],
    });
    inited = true;
  }
  return StellarWalletsKit;
}

export type WalletOption = ISupportedWallet;
export async function listWallets(): Promise<WalletOption[]> {
  const all = await kit().refreshSupportedWallets();
  return WALLET_ORDER.map((id) => all.find((w) => w.id === id)).filter(Boolean) as WalletOption[];
}

export class WalletError extends Error { constructor(public kind: "not-installed" | "rejected" | "other", msg: string) { super(msg); } }
export function classify(e: unknown): WalletError {
  if (e instanceof WalletError) return e;
  const m = (e as { message?: string })?.message ?? String(e ?? "");
  if (/reject|denied|declin|cancel|closed|user/i.test(m)) return new WalletError("rejected", "You cancelled the request in your wallet.");
  if (/not (installed|available|detected)|no wallet/i.test(m)) return new WalletError("not-installed", m);
  return new WalletError("other", m || "Wallet error");
}

export async function connectWallet(id: string, opts: { available: boolean; name: string; url?: string }) {
  if (!opts.available) throw new WalletError("not-installed", `${opts.name} isn't installed in this browser.${opts.url ? ` Get it at ${opts.url}` : ""}`);
  try {
    const k = kit();
    k.setWallet(id);
    const { address } = await k.fetchAddress();
    if (!address) throw new Error("No address returned");
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id, address }));
    return address;
  } catch (e) { throw classify(e); }
}

export function savedWallet(): { id: string; address: string } | null {
  try { const v = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); return v?.id && v?.address ? v : null; } catch { return null; }
}
export function forgetWallet() { try { sessionStorage.removeItem(SESSION_KEY); } catch { /* */ } try { if (inited) void StellarWalletsKit.disconnect(); } catch { /* */ } }

export class KitSigner implements Signer {
  readonly kind = "kit" as const;
  constructor(readonly address: string, readonly walletId: string) {}
  async signTransaction(xdr: string) {
    try {
      const k = kit(); k.setWallet(this.walletId);
      const r = await k.signTransaction(xdr, { networkPassphrase: NETWORK_PASSPHRASE, address: this.address });
      return r.signedTxXdr;
    } catch (e) { throw classify(e); }
  }
}
