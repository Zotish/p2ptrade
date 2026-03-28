import { listChains, listActiveDepositAssets } from "../../repositories/admin.js";
import { all } from "../../db.js";
import { getDepositByTx, createDeposit } from "../../repositories/deposits.js";
import { adjustBalance } from "../../repositories/balances.js";
import { withTronRpc } from "../rpcProvider.js";
import { tronAddressEquals } from "../tronUtils.js";
import { config } from "../../config.js";
import { getLastBlock, setLastBlock } from "../../repositories/chainSync.js";

export function startTronWatcher() {
  const interval = Number(process.env.WATCHER_INTERVAL_MS || 15000);
  const timers = new Map();
  async function refresh() {
    try {
      const chains = await listChains();
      const tronChains = chains.filter(
        (c) => c.is_active && c.kind === "tron" && hasRpc(c)
      );
      if (!tronChains.length) {
        if (timers.size === 0) {
          console.log("Tron watcher disabled: no active Tron chains");
        }
        return;
      }
      for (const chain of tronChains) {
        if (timers.has(chain.code)) continue;
        const tick = () => pollTron(chain.code).catch((e) => console.error(`${chain.code} watcher error`, e.message));
        timers.set(chain.code, setInterval(tick, interval));
        tick();
      }
      if (timers.size) {
        console.log(`Tron watcher started (${Array.from(timers.keys()).join(", ")})`);
      }
    } catch (error) {
      console.error("Tron watcher init failed:", error.message);
    }
  }
  refresh();
  setInterval(refresh, 60000);
}

function hasRpc(chain) {
  const admin = String(chain.rpc_urls || chain.rpc_url || "").trim();
  if (admin) return true;
  if (chain.code === "TRX" || chain.code === "TRON") return config.tronRpcUrls.length > 0;
  return false;
}

async function pollTron(chainCode) {
  const assets = await listActiveDepositAssets();
  const chainAssets = assets.filter((a) => a.chain_code === chainCode);
  if (!chainAssets.length) return;
  const nativeAsset = chainAssets.find((a) => Number(a.is_native) === 1) || null;
  const tokens = chainAssets.filter((a) => Number(a.is_native) !== 1 && a.contract_address);

  const addresses = await all("select * from wallet_addresses where chain = ?", [chainCode]);
  if (!addresses.length) return;

  const key = `TRON_${chainCode}`;
  const lastRaw = await getLastBlock(key);
  const lastTimestamp = lastRaw ? Number(lastRaw) : 0;
  let nextTimestamp = lastTimestamp;

  for (const addr of addresses) {
    await withTronRpc(chainCode, async (baseUrl) => {
      const nativeTxs = await fetchTronJson(
        `${baseUrl}/v1/accounts/${addr.address}/transactions?only_confirmed=true&limit=50`
      );
      for (const tx of nativeTxs) {
        const timestamp = Number(tx.block_timestamp || 0);
        if (timestamp <= lastTimestamp) continue;
        if (timestamp > nextTimestamp) nextTimestamp = timestamp;
        const contract = tx.raw_data?.contract?.[0];
        if (!contract || contract.type !== "TransferContract") continue;
        const value = contract.parameter?.value || {};
        if (!value.to_address || !nativeAsset) continue;
        const matches = tronAddressEquals(addr.address, value.to_address);
        if (!matches) continue;
        const amount = Number(value.amount || 0) / 1e6;
        if (amount <= 0) continue;
        const txid = `${tx.txID}:${addr.address}`;
        const exists = await getDepositByTx(nativeAsset.symbol, txid);
        if (exists) continue;
        await createDeposit({
          addressId: addr.id,
          chain: nativeAsset.symbol,
          txid,
          amount,
          confirmations: config.confTron,
          status: "confirmed"
        });
        await adjustBalance(addr.user_id, nativeAsset.symbol, amount);
      }

      if (tokens.length) {
        const trc20Txs = await fetchTronJson(
          `${baseUrl}/v1/accounts/${addr.address}/transactions/trc20?only_confirmed=true&limit=50`
        );
        for (const tx of trc20Txs) {
          const timestamp = Number(tx.block_timestamp || 0);
          if (timestamp <= lastTimestamp) continue;
          if (timestamp > nextTimestamp) nextTimestamp = timestamp;
          const tokenInfo = tx.token_info || {};
          const contract = String(tokenInfo.address || "").toLowerCase();
          const token = tokens.find((t) => String(t.contract_address || "").toLowerCase() === contract);
          if (!token) continue;
          if (String(tx.to || "").toLowerCase() !== String(addr.address || "").toLowerCase()) continue;
          const decimals = Number.isFinite(Number(token.decimals)) ? Number(token.decimals) : Number(tokenInfo.decimals || 0);
          const amount = Number(tx.value || 0) / 10 ** decimals;
          if (amount <= 0) continue;
          const txid = `${tx.transaction_id || tx.txID}:${token.symbol}`;
          const exists = await getDepositByTx(token.symbol, txid);
          if (exists) continue;
          await createDeposit({
            addressId: addr.id,
            chain: token.symbol,
            txid,
            amount,
            confirmations: config.confTron,
            status: "confirmed"
          });
          await adjustBalance(addr.user_id, token.symbol, amount);
        }
      }
    });
  }

  if (nextTimestamp && nextTimestamp > lastTimestamp) {
    await setLastBlock(key, nextTimestamp);
  }
}

async function fetchTronJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const json = await res.json();
  return json.data || [];
}
