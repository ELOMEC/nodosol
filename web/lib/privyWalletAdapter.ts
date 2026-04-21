import {
  BaseMessageSignerWalletAdapter,
  WalletName,
  WalletNotConnectedError,
  WalletReadyState,
  WalletSignTransactionError,
} from "@solana/wallet-adapter-base";
import type { TransactionVersion } from "@solana/web3.js";
import {
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";

export type PrivySource = {
  address: string;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>;
};

export const PrivyWalletName = "Privy" as WalletName<"Privy">;

const PRIVY_ICON =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIyMCIgY3k9IjIwIiByPSIyMCIgZmlsbD0iIzRmNDZlNSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTUlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjZmZmIiBmb250LXNpemU9IjE0IiBmb250LWZhbWlseT0iLWFwcGxlLXN5c3RlbSwgc2Fucy1zZXJpZiIgZm9udC13ZWlnaHQ9IjcwMCI+UDwvdGV4dD48L3N2Zz4=";

export class PrivyWalletAdapter extends BaseMessageSignerWalletAdapter {
  name = PrivyWalletName;
  url = "https://privy.io";
  icon = PRIVY_ICON;
  supportedTransactionVersions: ReadonlySet<TransactionVersion> = new Set(["legacy", 0]);

  private _source: PrivySource | null = null;
  private _publicKey: PublicKey | null = null;
  private _connecting = false;

  get readyState(): WalletReadyState {
    return WalletReadyState.Loadable;
  }
  get publicKey(): PublicKey | null {
    return this._publicKey;
  }
  get connecting(): boolean {
    return this._connecting;
  }

  setSource(source: PrivySource | null): void {
    this._source = source;
    if (!source) {
      if (this._publicKey) {
        this._publicKey = null;
        this.emit("disconnect");
      }
      return;
    }
    const pk = new PublicKey(source.address);
    if (!this._publicKey || !this._publicKey.equals(pk)) {
      this._publicKey = pk;
      this.emit("connect", pk);
    }
  }

  async connect(): Promise<void> {
    if (this._publicKey) return;
    if (!this._source) {
      throw new WalletNotConnectedError("Privy wallet not ready");
    }
    this._connecting = true;
    try {
      const pk = new PublicKey(this._source.address);
      this._publicKey = pk;
      this.emit("connect", pk);
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    if (!this._publicKey) return;
    this._publicKey = null;
    this.emit("disconnect");
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (!this._source) throw new WalletNotConnectedError();
    try {
      return await this._source.signTransaction(tx);
    } catch (err: any) {
      throw new WalletSignTransactionError(err?.message ?? "Signing failed", err);
    }
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    if (!this._source) throw new WalletNotConnectedError();
    try {
      return await this._source.signAllTransactions(txs);
    } catch (err: any) {
      throw new WalletSignTransactionError(err?.message ?? "Signing failed", err);
    }
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (!this._source) throw new WalletNotConnectedError();
    return await this._source.signMessage(message);
  }
}
