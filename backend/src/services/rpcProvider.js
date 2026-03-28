import { ethers } from "ethers";
import { Connection } from "@solana/web3.js";
import { config } from "../config.js";
import { getChainByCode } from "../repositories/admin.js";

const NETWORKS = {
  ETH: { chainId: 11155111, name: "sepolia" },
  BNB: { chainId: 97, name: "bsc-testnet" }
};

export async function getEvmRpcUrls(chain) {
  const adminChain = await getChainByCode(chain);
  const fromAdmin = String(adminChain?.rpc_urls || adminChain?.rpc_url || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (fromAdmin.length) return fromAdmin;
  if (chain === "ETH") return config.ethRpcUrls;
  if (chain === "BNB") return config.bscRpcUrls;
  return [];
}

export async function getSolRpcUrls(chain) {
  const adminChain = await getChainByCode(chain);
  const fromAdmin = String(adminChain?.rpc_urls || adminChain?.rpc_url || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (fromAdmin.length) return fromAdmin;
  if (chain === "SOL") return config.solRpcUrls;
  return [];
}

export async function getBtcApiUrls(chain) {
  const adminChain = await getChainByCode(chain);
  const fromAdmin = String(adminChain?.rpc_urls || adminChain?.rpc_url || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (fromAdmin.length) return fromAdmin;
  if (chain === "BTC") return config.btcApiUrls;
  return [];
}

export async function getTronRpcUrls(chain) {
  const adminChain = await getChainByCode(chain);
  const fromAdmin = String(adminChain?.rpc_urls || adminChain?.rpc_url || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (fromAdmin.length) return fromAdmin;
  if (chain === "TRX" || chain === "TRON") return config.tronRpcUrls;
  return [];
}

export async function getRippleRpcUrls(chain) {
  const adminChain = await getChainByCode(chain);
  const fromAdmin = String(adminChain?.rpc_urls || adminChain?.rpc_url || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (fromAdmin.length) return fromAdmin;
  if (chain === "XRP" || chain === "XRPL") return config.rippleRpcUrls;
  return [];
}

export async function withTronRpc(chain, fn) {
  const urls = await getTronRpcUrls(chain);
  if (!urls.length) throw new Error(`Missing Tron RPC URL for ${chain}`);
  let lastError = null;
  for (const url of urls) {
    try {
      return await fn(url);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`${chain} Tron RPC unavailable`);
}

export async function withRippleRpc(chain, fn) {
  const urls = await getRippleRpcUrls(chain);
  if (!urls.length) throw new Error(`Missing Ripple RPC URL for ${chain}`);
  let lastError = null;
  for (const url of urls) {
    try {
      return await fn(url);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`${chain} Ripple RPC unavailable`);
}

export function createRpcProvider(chain, rpcUrl) {
  const network = NETWORKS[chain];
  if (!rpcUrl) {
    throw new Error(`Missing RPC URL for ${chain}`);
  }
  if (network) {
    return new ethers.JsonRpcProvider(rpcUrl, network, { staticNetwork: true });
  }
  return new ethers.JsonRpcProvider(rpcUrl);
}

export async function withEvmProvider(chain, fn) {
  const urls = await getEvmRpcUrls(chain);
  if (!urls.length) {
    throw new Error(`Missing RPC URL for ${chain}`);
  }
  let lastError = null;
  for (const url of urls) {
    try {
      const provider = createRpcProvider(chain, url);
      return await fn(provider, url);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`${chain} RPC unavailable`);
}

export async function withSolConnection(chain, fn) {
  const urls = await getSolRpcUrls(chain);
  if (!urls.length) {
    throw new Error(`Missing SOL RPC URL for ${chain}`);
  }
  let lastError = null;
  for (const url of urls) {
    try {
      const connection = new Connection(url, "confirmed");
      return await fn(connection, url);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`${chain} SOL RPC unavailable`);
}

export async function fetchBtcJson(path, chain = "BTC") {
  return fetchBtcWithFallback(path, "json", chain);
}

export async function fetchBtcText(path, chain = "BTC") {
  return fetchBtcWithFallback(path, "text", chain);
}

async function fetchBtcWithFallback(path, mode, chain) {
  const urls = await getBtcApiUrls(chain);
  if (!urls.length) {
    throw new Error(`Missing BTC API URL for ${chain}`);
  }
  let lastError = null;
  for (const base of urls) {
    try {
      const res = await fetch(`${base}${path}`);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return mode === "json" ? await res.json() : await res.text();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("BTC API unavailable");
}
