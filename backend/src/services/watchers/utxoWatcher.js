import { listChains } from "../../repositories/admin.js";
import { all } from "../../db.js";
import { createDepositIfNew } from "../../repositories/deposits.js";
import { adjustBalance } from "../../repositories/balances.js";
import { fetchBtcJson, fetchBtcText } from "../rpcProvider.js";
import { config } from "../../config.js";

export function startUtxoWatcher() {
  const interval = Number(process.env.WATCHER_INTERVAL_MS || 20000);
  const timers = new Map();
  async function refresh() {
    try {
      const chains = await listChains();
      const utxoChains = chains.filter((c) => c.is_active && c.kind === "utxo");
      for (const chain of utxoChains) {
        if (timers.has(chain.code)) continue;
        const tick = () => pollUtxo(chain.code).catch((e) => console.error(`${chain.code} watcher error`, e.message));
        timers.set(chain.code, setInterval(tick, interval));
        tick();
      }
      if (utxoChains.length) {
        console.log(`UTXO watcher started (${utxoChains.map((c) => c.code).join(", ")})`);
      }
    } catch (error) {
      console.error("UTXO watcher init failed:", error.message);
    }
  }
  refresh();
  setInterval(refresh, 60000);
}

async function pollUtxo(chainCode) {
  const addresses = await all("select * from wallet_addresses where chain = ?", [chainCode]);
  if (!addresses.length) return;

  let tip = null;
  try {
    tip = Number(await fetchBtcText("/blocks/tip/height", chainCode));
  } catch (e) {
    console.error(`${chainCode} watcher tip fetch failed:`, e.message);
    return;
  }

  for (const addr of addresses) {
    try {
      const txs = await fetchBtcJson(`/address/${addr.address}/txs`, chainCode);
      if (!Array.isArray(txs)) continue;
      for (const tx of txs) {
        const outputs = Array.isArray(tx.vout) ? tx.vout : [];
        for (let vout = 0; vout < outputs.length; vout += 1) {
          const out = outputs[vout];
          const matches = Array.isArray(out?.scriptpubkey_address)
            ? out.scriptpubkey_address.includes(addr.address)
            : out?.scriptpubkey_address === addr.address;
          if (!matches) continue;
          const txid = `${tx.txid}:${vout}`;
          const blockHeight = tx.status?.block_height;
          const confirmations = blockHeight ? tip - blockHeight + 1 : 0;
          if (confirmations < (config.confBtc || 1)) continue;
          const amount = Number(out.value || 0) / 1e8;
          if (amount <= 0) continue;
          const { inserted } = await createDepositIfNew({
            addressId: addr.id,
            chain: chainCode,
            txid,
            amount,
            confirmations,
            status: "confirmed"
          });
          if (inserted) await adjustBalance(addr.user_id, chainCode, amount);
        }
      }
    } catch (e) {
      console.error(`${chainCode} watcher address fetch failed for ${addr.address}:`, e.message);
    }
  }
}
