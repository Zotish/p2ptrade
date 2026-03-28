import { all } from "../db.js";
import { listActiveAssets, listChains } from "../repositories/admin.js";
import { listPlatformFees } from "../repositories/platformFees.js";
import { listUserBalancesTotals } from "../repositories/balances.js";
import { deriveTreasuryAddress } from "./hdWallet.js";
import {
  withEvmProvider,
  withSolConnection,
  withTronRpc,
  withRippleRpc,
  fetchBtcJson
} from "./rpcProvider.js";
import { ethers } from "ethers";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "./solTokens.js";
import TronWeb from "tronweb";

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

export async function getTreasurySnapshot() {
  const [chains, assets, platformFees, userFunds] = await Promise.all([
    listChains(),
    listActiveAssets(),
    listPlatformFees(),
    listUserBalancesTotals()
  ]);

  const chainMap = new Map(chains.map((chain) => [chain.code, chain]));
  const addresses = await all("select chain, address from wallet_addresses", []);
  const addressesByChain = new Map();
  for (const row of addresses) {
    if (!addressesByChain.has(row.chain)) addressesByChain.set(row.chain, []);
    addressesByChain.get(row.chain).push(row.address);
  }

  const onchain = [];
  const treasuryAddresses = [];
  for (const asset of assets) {
    const chain = chainMap.get(asset.chain_code);
    if (!chain || !chain.is_active) continue;
    const addrList = addressesByChain.get(asset.chain_code) || [];
    const entry = {
      asset: asset.symbol,
      chain: asset.chain_code,
      addressCount: addrList.length,
      total: 0,
      error: null
    };
    if (!addrList.length) {
      onchain.push(entry);
      continue;
    }

    try {
      if (chain.kind === "evm") {
        entry.total = await sumEvmBalances({
          chain: chain.code,
          isNative: Number(asset.is_native) === 1,
          contract: asset.contract_address,
          decimals: Number(asset.decimals || 18),
          addresses: addrList
        });
      } else if (chain.kind === "solana") {
        entry.total = await sumSolBalances({
          chain: chain.code,
          isNative: Number(asset.is_native) === 1,
          mint: asset.contract_address,
          decimals: Number(asset.decimals || 9),
          addresses: addrList
        });
      } else if (chain.kind === "utxo") {
        if (chain.code !== "BTC" || Number(asset.is_native) !== 1) {
          entry.error = "UTXO token balances not supported";
        } else {
          entry.total = await sumBtcBalances({ chain: chain.code, addresses: addrList });
        }
      } else if (chain.kind === "tron") {
        entry.total = await sumTronBalances({
          chain: chain.code,
          isNative: Number(asset.is_native) === 1,
          contract: asset.contract_address,
          decimals: Number(asset.decimals || 6),
          addresses: addrList
        });
      } else if (chain.kind === "ripple") {
        entry.total = await sumRippleBalances({
          chain: chain.code,
          isNative: Number(asset.is_native) === 1,
          spec: asset.contract_address,
          addresses: addrList
        });
      }
    } catch (error) {
      entry.error = error.message;
    }
    onchain.push(entry);
  }

  for (const chain of chains) {
    if (!chain.is_active) continue;
    try {
      const derived = deriveTreasuryAddress(chain.code, chain.kind);
      treasuryAddresses.push({
        chain: chain.code,
        kind: chain.kind,
        address: derived.address,
        path: derived.path
      });
    } catch (error) {
      treasuryAddresses.push({
        chain: chain.code,
        kind: chain.kind,
        address: null,
        path: null,
        error: error.message
      });
    }
  }

  return { onchain, platformFees, userFunds, treasuryAddresses };
}

async function sumEvmBalances({ chain, isNative, contract, decimals, addresses }) {
  return withEvmProvider(chain, async (provider) => {
    let total = 0;
    if (isNative) {
      for (const addr of addresses) {
        const bal = await provider.getBalance(addr);
        total += Number(ethers.formatEther(bal));
      }
      return total;
    }

    if (!contract) return 0;
    const erc20 = new ethers.Contract(contract, ERC20_ABI, provider);
    for (const addr of addresses) {
      const bal = await erc20.balanceOf(addr);
      total += Number(ethers.formatUnits(bal, decimals));
    }
    return total;
  });
}

async function sumSolBalances({ chain, isNative, mint, decimals, addresses }) {
  return withSolConnection(chain, async (connection) => {
    let total = 0;
    if (isNative) {
      for (const addr of addresses) {
        const bal = await connection.getBalance(new PublicKey(addr));
        total += bal / 1e9;
      }
      return total;
    }

    if (!mint) return 0;
    const mintKey = new PublicKey(mint);
    for (const addr of addresses) {
      const owner = new PublicKey(addr);
      const ata = getAssociatedTokenAddress(mintKey, owner);
      try {
        const bal = await connection.getTokenAccountBalance(ata);
        const ui = Number(bal?.value?.uiAmountString || bal?.value?.uiAmount || 0);
        if (Number.isFinite(ui)) {
          total += ui;
        }
      } catch {
        // no token account yet
      }
    }
    if (!Number.isFinite(total)) return 0;
    return total;
  });
}

async function sumBtcBalances({ chain, addresses }) {
  let total = 0;
  for (const addr of addresses) {
    const info = await fetchBtcJson(`/address/${addr}`, chain);
    const funded = Number(info?.chain_stats?.funded_txo_sum || 0);
    const spent = Number(info?.chain_stats?.spent_txo_sum || 0);
    const balance = funded - spent;
    total += balance / 1e8;
  }
  return total;
}

async function sumTronBalances({ chain, isNative, contract, decimals, addresses }) {
  return withTronRpc(chain, async (rpcUrl) => {
    const tronWeb = new TronWeb({ fullHost: rpcUrl });
    let total = 0;
    if (isNative) {
      for (const addr of addresses) {
        const bal = await tronWeb.trx.getBalance(addr);
        total += bal / 1e6;
      }
      return total;
    }

    if (!contract) return 0;
    const token = await tronWeb.contract().at(contract);
    for (const addr of addresses) {
      const bal = await token.balanceOf(addr).call();
      const raw = typeof bal === "object" && bal._hex ? BigInt(bal._hex) : BigInt(bal || 0);
      total += Number(raw) / 10 ** decimals;
    }
    return total;
  });
}

async function sumRippleBalances({ chain, isNative, spec, addresses }) {
  return withRippleRpc(chain, async (rpcUrl) => {
    let total = 0;
    let currency = null;
    let issuer = null;
    if (!isNative) {
      const parts = String(spec || "").split(":");
      if (parts.length === 2) {
        currency = parts[0].toUpperCase();
        issuer = parts[1];
      }
    }

    for (const addr of addresses) {
      if (isNative) {
        const infoRes = await fetch(rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ method: "account_info", params: [{ account: addr }] })
        });
        const infoJson = await infoRes.json();
        const drops = Number(infoJson?.result?.account_data?.Balance || 0);
        total += drops / 1e6;
      } else if (currency && issuer) {
        const linesRes = await fetch(rpcUrl, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ method: "account_lines", params: [{ account: addr }] })
        });
        const linesJson = await linesRes.json();
        const lines = linesJson?.result?.lines || [];
        const line = lines.find(
          (item) => item.currency === currency && item.account === issuer
        );
        if (line?.balance) {
          total += Number(line.balance);
        }
      }
    }
    return total;
  });
}
