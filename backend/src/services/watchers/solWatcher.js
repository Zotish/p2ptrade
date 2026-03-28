import { all } from "../../db.js";
import { createDeposit, getDepositByTx } from "../../repositories/deposits.js";
import { adjustBalance } from "../../repositories/balances.js";
import { PublicKey } from "@solana/web3.js";
import { config } from "../../config.js";
import { withSolConnection } from "../rpcProvider.js";
import { listChains } from "../../repositories/admin.js";
import { getSolAssetsByChain } from "../evmAssets.js";
import { getAssociatedTokenAddress, getTokenBalanceDelta } from "../solTokens.js";

export function startSolWatcher() {
  const interval = Number(process.env.WATCHER_INTERVAL_MS || 15000);
  const timers = new Map();
  async function refresh() {
    try {
      const chains = await listChains();
      const solChains = chains.filter(
        (c) => c.is_active && c.kind === "solana" && hasRpc(c)
      );
      if (!solChains.length) {
        if (timers.size === 0) {
          console.log("SOL watcher disabled: no active Solana chains");
        }
        return;
      }
      for (const chain of solChains) {
        if (timers.has(chain.code)) continue;
        const tick = () => pollSol(chain.code).catch((e) => console.error(`${chain.code} watcher error`, e.message));
        timers.set(chain.code, setInterval(tick, interval));
        tick();
      }
      if (timers.size) {
        console.log(`SOL watcher started (${Array.from(timers.keys()).join(", ")})`);
      }
    } catch (error) {
      console.error("SOL watcher init failed:", error.message);
    }
  }
  refresh();
  setInterval(refresh, 60000);
}

function hasRpc(chain) {
  const admin = String(chain.rpc_urls || chain.rpc_url || "").trim();
  if (admin) return true;
  if (chain.code === "SOL") return config.solRpcUrls.length > 0;
  return false;
}

async function pollSol(chainCode) {
  const addresses = await all("select * from wallet_addresses where chain = ?", [chainCode]);
  if (!addresses.length) return;
  const { native, tokens } = await getSolAssetsByChain(chainCode);
  await withSolConnection(chainCode, async (connection) => {
    for (const addr of addresses) {
      try {
        const pubkey = new PublicKey(addr.address);
        const sigs = await connection.getSignaturesForAddress(pubkey, { limit: 100 });
        for (const sig of sigs) {
          const txid = sig.signature;
          const nativeAsset = native.find((a) => a.symbol === chainCode) || native[0];
          if (!nativeAsset) continue;
          const exists = await getDepositByTx(nativeAsset.symbol, txid);
          if (exists) continue;
          if (!sig.confirmationStatus || sig.err) continue;
          const tx = await connection.getTransaction(txid, { maxSupportedTransactionVersion: 0 });
          if (!tx || !tx.meta || tx.meta.err) continue;
          const keys = tx.transaction.message.accountKeys.map((k) =>
            typeof k === "string" ? k : k.toBase58()
          );
          const index = keys.findIndex((k) => k === addr.address);
          if (index < 0) continue;
          const pre = tx.meta.preBalances[index] || 0;
          const post = tx.meta.postBalances[index] || 0;
          const delta = (post - pre) / 1e9;
          if (delta <= 0) continue;
          await createDeposit({
            addressId: addr.id,
            chain: nativeAsset.symbol,
            txid,
            amount: delta,
            confirmations: config.confSol,
            status: "confirmed"
          });
          await adjustBalance(addr.user_id, nativeAsset.symbol, delta);
        }

        for (const token of tokens) {
          if (!token.contract_address) continue;
          const ata = getAssociatedTokenAddress(token.contract_address, addr.address);
          const tokenSigs = await connection.getSignaturesForAddress(ata, { limit: 100 });
          for (const sig of tokenSigs) {
            const txid = `${sig.signature}:${token.symbol}`;
            const exists = await getDepositByTx(token.symbol, txid);
            if (exists) continue;
            if (!sig.confirmationStatus || sig.err) continue;
            const tx = await connection.getTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
            if (!tx || !tx.meta || tx.meta.err) continue;
            const delta = getTokenBalanceDelta(tx, ata.toBase58(), token.contract_address);
            if (delta <= 0) continue;
            await createDeposit({
              addressId: addr.id,
              chain: token.symbol,
              txid,
              amount: delta,
              confirmations: config.confSol,
              status: "confirmed"
            });
            await adjustBalance(addr.user_id, token.symbol, delta);
          }
        }
      } catch (error) {
        console.error(`${chainCode} watcher error for ${addr.address}:`, error.message);
      }
    }
  });
}
