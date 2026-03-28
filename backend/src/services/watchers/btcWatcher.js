import { config } from "../../config.js";
import { createDeposit, getDepositByTx } from "../../repositories/deposits.js";
import { adjustBalance } from "../../repositories/balances.js";
import { getUserAddresses } from "../../services/walletService.js";
import { all } from "../../db.js";
import { fetchBtcJson, fetchBtcText } from "../rpcProvider.js";

export function startBtcWatcher() {
  const interval = Number(process.env.WATCHER_INTERVAL_MS || 15000);
  if (!config.walletMnemonic) {
    console.log("BTC watcher disabled: WALLET_MNEMONIC not set");
    return;
  }
  setInterval(() => pollBtc().catch((e) => console.error("BTC watcher error", e.message)), interval);
  pollBtc().catch(() => {});
  console.log("BTC watcher started (testnet via mempool.space)");
}

async function pollBtc() {
  const addresses = await allDepositAddresses("BTC");
  if (!addresses.length) return;

  let tip = null;
  try {
    tip = Number(await fetchBtcText("/blocks/tip/height"));
  } catch (e) {
    console.error("BTC watcher tip fetch failed:", e.message);
    return;
  }

  for (const addr of addresses) {
    try {
      const txs = await fetchBtcJson(`/address/${addr.address}/txs`);
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
          const exists = await getDepositByTx("BTC", txid);
          if (exists) continue;
          const blockHeight = tx.status?.block_height;
          const confirmations = blockHeight ? tip - blockHeight + 1 : 0;
          if (confirmations < config.confBtc) continue;
          const amount = Number(out.value || 0) / 1e8;
          if (amount <= 0) continue;
          await createDeposit({
            addressId: addr.id,
            chain: "BTC",
            txid,
            amount,
            confirmations,
            status: "confirmed"
          });
          await adjustBalance(addr.user_id, "BTC", amount);
        }
      }
    } catch (e) {
      console.error(`BTC watcher address fetch failed for ${addr.address}:`, e.message);
      continue;
    }
  }
}

async function allDepositAddresses(chain) {
  // walletService fetches by user, so gather from all users
  const list = [];
  const users = await all("select id from users", []);
  for (const u of users) {
    const addresses = await getUserAddresses(u.id);
    for (const a of addresses) {
      if (a.chain === chain) list.push(a);
    }
  }
  return list;
}
