import { config } from "../config.js";
import { ethers } from "ethers";
import { PublicKey } from "@solana/web3.js";
import { getUserAddresses } from "./walletService.js";
import { createDeposit, getDepositByTx } from "../repositories/deposits.js";
import { adjustBalance } from "../repositories/balances.js";
import { fetchBtcJson, fetchBtcText, withEvmProvider, withSolConnection } from "./rpcProvider.js";
import { withTronRpc, withRippleRpc } from "./rpcProvider.js";
import { getEvmAssetsByChain, getSolAssetsByChain, listActiveDepositAssetsCached } from "./evmAssets.js";
import { getAssociatedTokenAddress, getTokenBalanceDelta } from "./solTokens.js";
import { listChains } from "../repositories/admin.js";
import { tronAddressEquals } from "./tronUtils.js";

const ERC20_IFACE = new ethers.Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)"
]);
const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

export async function scanRecentForUser(userId, lookback = 2000) {
  const addresses = await getUserAddresses(userId);
  const activeAssets = await listActiveDepositAssetsCached();
  const result = {
    ok: true,
    scanned: lookback,
    credited: {}
  };

  for (const asset of activeAssets) {
    if (!result.credited[asset.symbol]) result.credited[asset.symbol] = 0;
  }

  const chains = await listChains();
  const evmChains = chains.filter(
    (c) => c.is_active && c.kind === "evm" && hasChainRpc(c)
  );
  for (const chain of evmChains) {
    await scanRecentEvm(chain.code, addresses, lookback, result);
  }
  const utxoChains = chains.filter((c) => c.is_active && c.kind === "utxo");
  for (const chain of utxoChains) {
    await scanRecentUtxo(chain.code, addresses, result);
  }
  const solChains = chains.filter(
    (c) => c.is_active && c.kind === "solana" && hasChainRpc(c)
  );
  for (const chain of solChains) {
    await scanRecentSol(chain.code, addresses, result);
  }

  const tronChains = chains.filter(
    (c) => c.is_active && c.kind === "tron" && hasChainRpc(c)
  );
  for (const chain of tronChains) {
    await scanRecentTron(chain.code, addresses, result);
  }

  const rippleChains = chains.filter(
    (c) => c.is_active && c.kind === "ripple" && hasChainRpc(c)
  );
  for (const chain of rippleChains) {
    await scanRecentRipple(chain.code, addresses, result);
  }

  return result;
}

async function scanRecentEvm(chain, addresses, lookback, result) {
  const { native, tokens } = await getEvmAssetsByChain(chain);
  if (!native.length && !tokens.length) return;

  const addressChains = new Set([chain]);
  native.forEach((asset) => addressChains.add(asset.symbol));
  tokens.forEach((asset) => addressChains.add(asset.symbol));
  const addressList = addresses.filter((a) => addressChains.has(a.chain));
  if (!addressList.length) return;

  const addressMap = new Map(addressList.map((a) => [a.address.toLowerCase(), a]));
  await withEvmProvider(chain, async (provider) => {
    const latest = await provider.getBlockNumber();
    const from = Math.max(latest - lookback, 0);

    for (let b = from; b <= latest; b += 1) {
      const block = await getBlockWithTransactions(provider, b);
      if (!block) continue;
      for (const tx of block.transactions) {
        if (!tx.to || !tx.value) continue;
        const row = addressMap.get(tx.to.toLowerCase());
        if (!row) continue;
        const nativeAsset = native.find((a) => a.symbol === chain) || native[0];
        if (!nativeAsset) continue;
        const txid = `${tx.hash}:${tx.to}`;
        const exists = await getDepositByTx(nativeAsset.symbol, txid);
        if (exists) continue;
        const amount = Number(ethers.formatEther(tx.value));
        if (amount <= 0) continue;
        await createDeposit({
          addressId: row.id,
          chain: nativeAsset.symbol,
          txid,
          amount,
          confirmations: 1,
          status: "confirmed"
        });
        await adjustBalance(row.user_id, nativeAsset.symbol, amount);
        result.credited[nativeAsset.symbol] = (result.credited[nativeAsset.symbol] || 0) + 1;
      }
    }

    for (const asset of tokens) {
      try {
        if (!asset.contract_address) continue;
        const logs = await provider.getLogs({
          address: asset.contract_address,
          fromBlock: from,
          toBlock: latest,
          topics: [TRANSFER_TOPIC]
        });

        for (const log of logs) {
          const parsed = ERC20_IFACE.parseLog(log);
          const row = addressMap.get(String(parsed.args.to).toLowerCase());
          if (!row) continue;
          const txid = `${log.transactionHash}:${log.index}`;
          const exists = await getDepositByTx(asset.symbol, txid);
          if (exists) continue;
          const decimals = Number.isFinite(Number(asset.decimals)) ? Number(asset.decimals) : 18;
          const amount = Number(ethers.formatUnits(parsed.args.value, decimals));
          await createDeposit({
            addressId: row.id,
            chain: asset.symbol,
            txid,
            amount,
            confirmations: 1,
            status: "confirmed"
          });
          await adjustBalance(row.user_id, asset.symbol, amount);
          result.credited[asset.symbol] = (result.credited[asset.symbol] || 0) + 1;
        }
      } catch (error) {
        console.error(`Recent ${chain} token scan failed for ${asset.symbol}:`, error.message);
      }
    }
  });
}

async function scanRecentUtxo(chainCode, addresses, result) {
  const chainAddresses = addresses.filter((a) => a.chain === chainCode);
  if (!chainAddresses.length) return;

  let tip;
  try {
    tip = Number(await fetchBtcText("/blocks/tip/height", chainCode));
  } catch (error) {
    console.error(`Recent ${chainCode} scan tip fetch failed:`, error.message);
    return;
  }

  for (const addr of chainAddresses) {
    try {
      const txs = await fetchBtcJson(`/address/${addr.address}/txs`, chainCode);
      if (!Array.isArray(txs)) continue;
      for (const tx of txs) {
        const outputs = Array.isArray(tx.vout) ? tx.vout : [];
        for (let vout = 0; vout < outputs.length; vout += 1) {
          const out = outputs[vout];
          if (out?.scriptpubkey_address !== addr.address) continue;
          const txid = `${tx.txid}:${vout}`;
          const exists = await getDepositByTx(chainCode, txid);
          if (exists) continue;
          const confirmations = tx.status?.block_height ? tip - tx.status.block_height + 1 : 0;
          if (confirmations < config.confBtc) continue;
          const amount = Number(out.value || 0) / 1e8;
          if (amount <= 0) continue;
          await createDeposit({
            addressId: addr.id,
            chain: chainCode,
            txid,
            amount,
            confirmations,
            status: "confirmed"
          });
          await adjustBalance(addr.user_id, chainCode, amount);
          result.credited[chainCode] = (result.credited[chainCode] || 0) + 1;
        }
      }
    } catch (error) {
      console.error(`Recent ${chainCode} scan address fetch failed:`, error.message);
    }
  }
}

async function scanRecentSol(chainCode, addresses, result) {
  const solAddresses = addresses.filter((a) => a.chain === chainCode);
  if (!solAddresses.length) return;
  const { native, tokens } = await getSolAssetsByChain(chainCode);
  if (!native.length && !tokens.length) return;

  await withSolConnection(chainCode, async (connection) => {
    for (const addr of solAddresses) {
      try {
        const pubkey = new PublicKey(addr.address);
        const sigs = await connection.getSignaturesForAddress(pubkey, {
          limit: 100
        });
        for (const sig of sigs) {
          const txid = sig.signature;
          const nativeAsset = native.find((a) => a.symbol === chainCode) || native[0];
          if (!nativeAsset) continue;
          const exists = await getDepositByTx(nativeAsset.symbol, txid);
          if (exists) continue;
          if (!sig.confirmationStatus || sig.err) continue;
          const tx = await connection.getTransaction(txid, {
            maxSupportedTransactionVersion: 0
          });
          if (!tx || !tx.meta) continue;
          if (tx.meta.err) continue;
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
          result.credited[nativeAsset.symbol] = (result.credited[nativeAsset.symbol] || 0) + 1;
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
            const tx = await connection.getTransaction(sig.signature, {
              maxSupportedTransactionVersion: 0
            });
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
            result.credited[token.symbol] = (result.credited[token.symbol] || 0) + 1;
          }
        }
      } catch (error) {
        console.error(`Recent SOL scan failed for ${addr.address}:`, error.message);
      }
    }
  });
}

async function scanRecentTron(chainCode, addresses, result) {
  const chainAddresses = addresses.filter((a) => a.chain === chainCode);
  if (!chainAddresses.length) return;
  const assets = await listActiveDepositAssetsCached();
  const chainAssets = assets.filter((a) => a.chain_code === chainCode);
  if (!chainAssets.length) return;
  const nativeAsset = chainAssets.find((a) => Number(a.is_native) === 1) || null;
  const tokens = chainAssets.filter((a) => Number(a.is_native) !== 1 && a.contract_address);

  for (const addr of chainAddresses) {
    await withTronRpc(chainCode, async (baseUrl) => {
      const nativeTxs = await fetchTronJson(
        `${baseUrl}/v1/accounts/${addr.address}/transactions?only_confirmed=true&limit=50`
      );
      for (const tx of nativeTxs) {
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
        result.credited[nativeAsset.symbol] = (result.credited[nativeAsset.symbol] || 0) + 1;
      }

      if (tokens.length) {
        const trc20Txs = await fetchTronJson(
          `${baseUrl}/v1/accounts/${addr.address}/transactions/trc20?only_confirmed=true&limit=50`
        );
        for (const tx of trc20Txs) {
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
          result.credited[token.symbol] = (result.credited[token.symbol] || 0) + 1;
        }
      }
    });
  }
}

async function scanRecentRipple(chainCode, addresses, result) {
  const chainAddresses = addresses.filter((a) => a.chain === chainCode);
  if (!chainAddresses.length) return;
  const assets = await listActiveDepositAssetsCached();
  const chainAssets = assets.filter((a) => a.chain_code === chainCode);
  if (!chainAssets.length) return;
  const nativeAsset = chainAssets.find((a) => Number(a.is_native) === 1) || null;
  const tokens = chainAssets.filter((a) => Number(a.is_native) !== 1);

  for (const addr of chainAddresses) {
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
          result.credited[nativeAsset.symbol] = (result.credited[nativeAsset.symbol] || 0) + 1;
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
          result.credited[token.symbol] = (result.credited[token.symbol] || 0) + 1;
        }
      }
    });
  }
}

async function fetchTronJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const json = await res.json();
  return json.data || [];
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

function hasChainRpc(chain) {
  const admin = String(chain.rpc_urls || chain.rpc_url || "").trim();
  if (admin) return true;
  if (chain.code === "ETH") return config.ethRpcUrls.length > 0;
  if (chain.code === "BNB") return config.bscRpcUrls.length > 0;
  if (chain.code === "SOL") return config.solRpcUrls.length > 0;
  if (chain.code === "TRX" || chain.code === "TRON") return config.tronRpcUrls.length > 0;
  if (chain.code === "XRP" || chain.code === "XRPL") return config.rippleRpcUrls.length > 0;
  return false;
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
      value: tx.value
    }))
  };
}
