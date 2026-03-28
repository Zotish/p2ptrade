import { listChains, listActiveDepositAssets } from "../../repositories/admin.js";
import { all } from "../../db.js";
import { getDepositByTx, createDeposit } from "../../repositories/deposits.js";
import { adjustBalance } from "../../repositories/balances.js";
import { withRippleRpc } from "../rpcProvider.js";
import { config } from "../../config.js";

export function startRippleWatcher() {
  const interval = Number(process.env.WATCHER_INTERVAL_MS || 20000);
  const timers = new Map();
  async function refresh() {
    try {
      const chains = await listChains();
      const rippleChains = chains.filter((c) => c.is_active && c.kind === "ripple" && hasRpc(c));
      if (!rippleChains.length) {
        if (timers.size === 0) {
          console.log("Ripple watcher disabled: no active Ripple chains");
        }
        return;
      }
      for (const chain of rippleChains) {
        if (timers.has(chain.code)) continue;
        const tick = () => pollRipple(chain.code).catch((e) => console.error(`${chain.code} watcher error`, e.message));
        timers.set(chain.code, setInterval(tick, interval));
        tick();
      }
      if (timers.size) {
        console.log(`Ripple watcher started (${Array.from(timers.keys()).join(", ")})`);
      }
    } catch (error) {
      console.error("Ripple watcher init failed:", error.message);
    }
  }
  refresh();
  setInterval(refresh, 60000);
}

function hasRpc(chain) {
  const admin = String(chain.rpc_urls || chain.rpc_url || "").trim();
  if (admin) return true;
  if (chain.code === "XRP" || chain.code === "XRPL") return config.rippleRpcUrls.length > 0;
  return false;
}

async function pollRipple(chainCode) {
  const assets = await listActiveDepositAssets();
  const chainAssets = assets.filter((a) => a.chain_code === chainCode);
  if (!chainAssets.length) return;
  const nativeAsset = chainAssets.find((a) => Number(a.is_native) === 1) || null;
  const tokens = chainAssets.filter((a) => Number(a.is_native) !== 1);

  const addresses = await all("select * from wallet_addresses where chain = ?", [chainCode]);
  if (!addresses.length) return;

  for (const addr of addresses) {
    await withRippleRpc(chainCode, async (rpcUrl) => {
      const payload = {
        method: "account_tx",
        params: [
          {
            account: addr.address,
            ledger_index_min: -1,
            ledger_index_max: -1,
            limit: 50
          }
        ]
      };
      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = await res.json();
      const txs = json.result?.transactions || [];
      for (const entry of txs) {
        const tx = entry.tx || entry;
        if (tx.TransactionType !== "Payment") continue;
        if (tx.Destination !== addr.address) continue;
        if (entry.validated === false) continue;
        const txid = tx.hash;
        if (!txid) continue;
        if (typeof tx.Amount === "string") {
          if (!nativeAsset) continue;
          const exists = await getDepositByTx(nativeAsset.symbol, txid);
          if (exists) continue;
          const amount = Number(tx.Amount) / 1e6;
          if (amount <= 0) continue;
          await createDeposit({
            addressId: addr.id,
            chain: nativeAsset.symbol,
            txid,
            amount,
            confirmations: config.confRipple,
            status: "confirmed"
          });
          await adjustBalance(addr.user_id, nativeAsset.symbol, amount);
        } else if (tx.Amount && typeof tx.Amount === "object") {
          const token = matchIssuedToken(tokens, tx.Amount);
          if (!token) continue;
          const exists = await getDepositByTx(token.symbol, txid);
          if (exists) continue;
          const amount = Number(tx.Amount.value || 0);
          if (amount <= 0) continue;
          await createDeposit({
            addressId: addr.id,
            chain: token.symbol,
            txid,
            amount,
            confirmations: config.confRipple,
            status: "confirmed"
          });
          await adjustBalance(addr.user_id, token.symbol, amount);
        }
      }
    });
  }
}

function matchIssuedToken(tokens, amountObj) {
  const currency = String(amountObj.currency || "").toUpperCase();
  const issuer = String(amountObj.issuer || "");
  return tokens.find((t) => {
    const spec = String(t.contract_address || "");
    if (!spec.includes(":")) return false;
    const [cur, iss] = spec.split(":");
    return String(cur || "").toUpperCase() === currency && String(iss || "") === issuer;
  });
}
