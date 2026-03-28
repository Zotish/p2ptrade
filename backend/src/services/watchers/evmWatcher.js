import { config } from "../../config.js";
import { all } from "../../db.js";
import { getLastBlock, setLastBlock } from "../../repositories/chainSync.js";
import { createDeposit, getDepositByTx } from "../../repositories/deposits.js";
import { adjustBalance } from "../../repositories/balances.js";
import { ethers } from "ethers";
import { withEvmProvider } from "../rpcProvider.js";
import { getEvmAssetsByChain } from "../evmAssets.js";
import { listChains } from "../../repositories/admin.js";

const ERC20_IFACE = new ethers.Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "function decimals() view returns (uint8)"
]);
const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

export function startEvmWatcher() {
  const interval = Number(process.env.WATCHER_INTERVAL_MS || 15000);
  const timers = new Map();
  async function refresh() {
    try {
      const chains = await listChains();
      const evmChains = chains.filter((c) => c.is_active && c.kind === "evm" && hasRpc(c));
      if (!evmChains.length) {
        if (timers.size === 0) {
          console.log("EVM watcher disabled: no active EVM chains");
        }
        return;
      }
      for (const chain of evmChains) {
        if (timers.has(chain.code)) continue;
        const tick = () => pollEvm(chain.code).catch((e) => console.error(`${chain.code} watcher error`, e.message));
        timers.set(chain.code, setInterval(tick, interval));
        tick();
      }
      if (timers.size) {
        console.log(`EVM watcher started (${Array.from(timers.keys()).join(", ")})`);
      }
    } catch (error) {
      console.error("EVM watcher init failed:", error.message);
    }
  }
  refresh();
  setInterval(refresh, 60000);
}

function hasRpc(chain) {
  const admin = String(chain.rpc_urls || chain.rpc_url || "").trim();
  if (admin) return true;
  if (chain.code === "ETH") return config.ethRpcUrls.length > 0;
  if (chain.code === "BNB") return config.bscRpcUrls.length > 0;
  return false;
}

async function pollEvm(chain) {
  const { native, tokens } = await getEvmAssetsByChain(chain);
  if (!native.length && !tokens.length) return;

  const addressChains = new Set([chain]);
  native.forEach((asset) => addressChains.add(asset.symbol));
  tokens.forEach((asset) => addressChains.add(asset.symbol));
  const chainList = Array.from(addressChains);
  const placeholders = chainList.map(() => "?").join(",");
  const addressRows = await all(
    `select * from wallet_addresses where chain in (${placeholders})`,
    chainList
  );
  if (!addressRows.length) return;

  await withEvmProvider(chain, async (provider) => {
    const latest = await getLatestBlock(provider, chain);
    if (latest == null) return;
  const key = `EVM_${chain}`;
  const lastRaw = await getLastBlock(key);
  const last = lastRaw ? Number(lastRaw) : Math.max(latest - 100, 0);
  const from = last + 1;
  const to = Math.min(latest, from + 100);
  const addressMap = new Map(addressRows.map((a) => [a.address.toLowerCase(), a]));

    // Native transfers (ETH/BNB)
    const nativeAsset = native.find((a) => a.symbol === chain) || native[0];
    for (let b = from; b <= to; b += 1) {
      const block = await getBlockWithTransactions(provider, b);
      if (!block) continue;
      for (const tx of block.transactions) {
        if (!tx.to || !tx.value) continue;
        const toAddr = tx.to.toLowerCase();
        const row = addressMap.get(toAddr);
        if (!row) continue;
        const amount = Number(ethers.formatEther(tx.value));
        if (amount <= 0) continue;
        if (!nativeAsset) continue;
        const txid = `${tx.hash}:${tx.to}`;
        const exists = await getDepositByTx(nativeAsset.symbol, txid);
        if (exists) continue;
        const confirmations = latest - (tx.blockNumber || block.number) + 1;
        if (confirmations < config.confEvm) continue;
        await createDeposit({
          addressId: row.id,
          chain: nativeAsset.symbol,
          txid,
          amount,
          confirmations,
          status: "confirmed"
        });
        await adjustBalance(row.user_id, nativeAsset.symbol, amount);
      }
    }

    // ERC-20 tokens (ETH/BNB)
    for (const asset of tokens) {
      try {
        const contractAddress = asset.contract_address;
        if (!contractAddress) continue;
        const logs = await provider.getLogs({
          address: contractAddress,
          fromBlock: from,
          toBlock: to,
          topics: [TRANSFER_TOPIC]
        });

        const decimals = Number.isFinite(Number(asset.decimals)) ? Number(asset.decimals) : 18;

        for (const log of logs) {
          const parsed = ERC20_IFACE.parseLog(log);
          const toAddr = String(parsed.args.to).toLowerCase();
          const row = addressMap.get(toAddr);
          if (!row) continue;
          const amount = Number(ethers.formatUnits(parsed.args.value, decimals));
          const txid = `${log.transactionHash}:${log.index}`;
          const exists = await getDepositByTx(asset.symbol, txid);
          if (exists) continue;
          const confirmations = latest - log.blockNumber + 1;
          if (confirmations < config.confEvm) continue;
          await createDeposit({
            addressId: row.id,
            chain: asset.symbol,
            txid,
            amount,
            confirmations,
            status: "confirmed"
          });
          await adjustBalance(row.user_id, asset.symbol, amount);
        }
      } catch (error) {
        console.error(`${chain} watcher token scan failed for ${asset.symbol}:`, error.message);
      }
    }

    await setLastBlock(key, to);
  });
}

async function getBlockWithTransactions(provider, blockNumber) {
  const hexBlock = ethers.toQuantity(blockNumber);
  const raw = await provider.send("eth_getBlockByNumber", [hexBlock, true]);
  if (!raw) return null;
  return {
    number: Number(raw.number),
    transactions: (raw.transactions || []).map((tx) => ({
      hash: tx.hash,
      to: tx.to,
      value: tx.value,
      blockNumber: tx.blockNumber ? Number(tx.blockNumber) : Number(raw.number)
    }))
  };
}

async function getLatestBlock(provider, chain) {
  try {
    return await provider.getBlockNumber();
  } catch (error) {
    console.error(`${chain} watcher rpc unavailable:`, error.message);
    return null;
  }
}
