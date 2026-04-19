import { deriveAddress } from "./hdWallet.js";
import { createAddress, getNextIndex, getUserChainAddress, listUserAddresses } from "../repositories/wallets.js";
import { config } from "../config.js";
import { getChainByCode, listChains } from "../repositories/admin.js";

let chainCache = { ts: 0, codes: [] };

export async function getSupportedChains() {
  const now = Date.now();
  if (now - chainCache.ts < 60000 && chainCache.codes.length) {
    return chainCache.codes.slice();
  }
  const chains = await listChains();
  const codes = chains
    .filter((c) => c.is_active && ["evm", "solana", "utxo", "tron", "ripple"].includes(String(c.kind || "")))
    .map((c) => c.code);
  chainCache = { ts: now, codes };
  return codes.slice();
}

/**
 * Get or create a wallet address for a user on a given chain.
 * Uses a retry loop to handle the rare race condition where two concurrent
 * signups try to claim the same derivation index simultaneously.
 * The UNIQUE(chain, idx) constraint in the DB ensures no two users ever share
 * the same address — failed inserts are retried with the next available index.
 */
export async function getOrCreateAddress(userId, chain) {
  const chainRow = await getChainByCode(chain);
  if (!chainRow || !chainRow.is_active) {
    throw new Error("Unsupported chain");
  }
  const existing = await getUserChainAddress(userId, chain);
  if (existing && !shouldRotateAddress(existing, chainRow)) return existing;

  // Retry loop: on unique idx collision, re-fetch max and try again
  const MAX_ATTEMPTS = 10;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const idx = await getNextIndex(chain);
    const derived = deriveAddress(chain, idx, chainRow.kind);
    try {
      return await createAddress({ userId, chain, address: derived.address, path: derived.path, idx });
    } catch (err) {
      // PostgreSQL unique violation code = '23505'
      const isIdxConflict =
        err.code === "23505" &&
        (err.constraint?.includes("chain_idx") || err.constraint?.includes("idx_unique") || String(err.detail || "").includes("(chain, idx)"));
      if (isIdxConflict) {
        // Another concurrent request claimed this idx — retry with a fresh max
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Failed to allocate unique wallet index for ${chain} after ${MAX_ATTEMPTS} attempts`);
}

export async function getUserAddresses(userId) {
  const rows = await listUserAddresses(userId);
  const repaired = [];
  for (const row of rows) {
    const chainRow = await getChainByCode(row.chain);
    if (chainRow && shouldRotateAddress(row, chainRow)) {
      const fresh = await getOrCreateAddress(userId, row.chain);
      repaired.push(fresh);
    } else {
      repaired.push(row);
    }
  }
  return repaired;
}

function shouldRotateAddress(addressRow, chainRow) {
  if (!addressRow?.address) return true;
  const kind = String(chainRow?.kind || "");
  const chainCode = String(addressRow?.chain || "");
  const address = String(addressRow.address || "");

  if (kind === "evm") {
    return !/^0x[a-fA-F0-9]{40}$/.test(address);
  }

  if (kind === "tron") {
    return !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
  }

  if (kind === "ripple") {
    return !/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address);
  }

  if (kind === "solana") {
    return !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }

  if (kind === "utxo") {
    if (chainCode === "BTC") {
      if (config.btcNetwork === "testnet") {
        return !address.startsWith("tb1");
      }
      return !address.startsWith("bc1");
    }
  }

  return false;
}
