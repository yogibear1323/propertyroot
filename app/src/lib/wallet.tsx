/**
 * Wallet state for Quasaria. Two interchangeable signers:
 *   - in-app key (generated or imported in the browser, held in memory), and
 *   - the Freighter extension.
 * Both implement `Signer`, so every transaction path is identical. The app
 * works read-only without any signer.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { NETWORK_PASSPHRASE } from "./config";
import { LocalKeySigner, type Signer } from "./signer";
import { KitSigner, connectWallet, forgetWallet, savedWallet, type WalletOption } from "./walletKit";
import { decryptSecret, encryptSecret, forgetStoredKey, loadStoredKey, saveStoredKey, type EncryptedKey } from "./keys";

type WalletState = {
  address: string | null;
  kind: Signer["kind"] | null;
  available: boolean;
  wrongNetwork: boolean;
  connecting: boolean;
  error: string | null;
  /** Encrypted key remembered on this device (public address only is readable). */
  stored: EncryptedKey | null;
  /** Account modal visibility (create / import / Freighter / unlock). */
  modalOpen: boolean;
  /** Open the account modal; pass "create" to jump straight into new-account creation. */
  openModal: (intent?: unknown) => void;
  modalIntent: "create" | null;
  closeModal: () => void;
  /** Opens the wallet picker. */
  connect: () => Promise<void>;
  pickerOpen: boolean;
  closePicker: () => void;
  connectWith: (w: WalletOption) => Promise<void>;
  walletId: string | null;
  loginWithSecret: (secret: string, rememberWithPassword?: string) => Promise<void>;
  unlockStored: (password: string) => Promise<void>;
  forgetDevice: () => void;
  disconnect: () => void;
  sign: (xdr: string) => Promise<string>;
};

const Ctx = createContext<WalletState | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [signer, setSigner] = useState<Signer | null>(null);
  const [available, setAvailable] = useState(false);
  const [wrongNetwork, setWrongNetwork] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stored, setStored] = useState<EncryptedKey | null>(() => loadStoredKey());
  const [modalOpen, setModalOpen] = useState(false);
  const [modalIntent, setModalIntent] = useState<"create" | null>(null);
  const current = useRef<Signer | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [walletId, setWalletId] = useState<string | null>(null);

  const replaceSigner = useCallback((s: Signer | null) => {
    if (current.current instanceof LocalKeySigner && current.current !== s) current.current.destroy();
    current.current = s;
    setSigner(s);
  }, []);

  useEffect(() => {
    setAvailable(true);
    const saved = savedWallet();
    if (saved) { const k = new KitSigner(saved.address, saved.id); current.current = k; setSigner(k); setWalletId(saved.id); }
    const onUnload = () => current.current instanceof LocalKeySigner && current.current.destroy();
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, []);

  const connect = useCallback(async () => { setError(null); setPickerOpen(true); }, []);

  const connectWith = useCallback(async (w: WalletOption) => {
    setConnecting(true);
    setError(null);
    try {
      const a = await connectWallet(w.id, { available: w.isAvailable, name: w.name, url: w.url });
      replaceSigner(new KitSigner(a, w.id));
      setWalletId(w.id);
      setWrongNetwork(false);
      setPickerOpen(false);
      setModalOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }, [replaceSigner]);

  const loginWithSecret = useCallback(
    async (secret: string, rememberWithPassword?: string) => {
      const s = new LocalKeySigner(secret, NETWORK_PASSPHRASE);
      if (rememberWithPassword) {
        const blob = await encryptSecret(secret, rememberWithPassword);
        saveStoredKey(blob);
        setStored(blob);
      }
      setWrongNetwork(false);
      setError(null);
      replaceSigner(s);
    },
    [replaceSigner],
  );

  const unlockStored = useCallback(
    async (password: string) => {
      const blob = loadStoredKey();
      if (!blob) throw new Error("No key is remembered on this device.");
      const secret = await decryptSecret(blob, password);
      replaceSigner(new LocalKeySigner(secret, NETWORK_PASSPHRASE));
      setError(null);
    },
    [replaceSigner],
  );

  const forgetDevice = useCallback(() => {
    forgetStoredKey();
    setStored(null);
    if (current.current?.kind === "local") replaceSigner(null);
  }, [replaceSigner]);

  const sign = useCallback(async (xdr: string) => {
    if (!current.current) throw new Error("Connect a wallet or create an account first");
    return current.current.signTransaction(xdr);
  }, []);

  return (
    <Ctx.Provider
      value={{
        address: signer?.address ?? null,
        kind: signer?.kind ?? null,
        available,
        wrongNetwork,
        connecting,
        error,
        stored,
        modalOpen,
        modalIntent,
        openModal: (intent?: unknown) => { setModalIntent(intent === "create" ? "create" : null); setModalOpen(true); },
        closeModal: () => setModalOpen(false),
        connect,
        pickerOpen,
        closePicker: () => setPickerOpen(false),
        connectWith,
        walletId,
        loginWithSecret,
        unlockStored,
        forgetDevice,
        disconnect: () => { forgetWallet(); setWalletId(null); replaceSigner(null); },
        sign,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useWallet() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWallet outside provider");
  return v;
}
