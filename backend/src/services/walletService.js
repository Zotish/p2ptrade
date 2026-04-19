import { deriveAddress } from "./hdWallet.js";
import { createAddress, getUserChainAddress, listUserAddresses } from "../repositories/wallets.js";
import { config } from "../config.js";
import { getChainByCode, listChains } from "../repositories/admin.js";
import { pool } from "../db.js";

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
 * Atomically allocate the next index for a chain using PostgreSQL advisory lock.
 * pg_advisory_xact_lock serializes concurrent allocations for the same chain,
 * preventing two users from receiving the same derivation index (and thus the same address).
 */
async function allocateAddressIndex(client, chain) {
  // Use a stable integer lock key derived from the chain string
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`wallet_idx_${chain}`]);
  const row = await client.query(
    "SELECT COALESCE(MAX(idx), -1) AS max_idx FROM wallet_addresses WHERE chain = $1",
    [chain]
  );
  return (Number(row.rows[0]?.max_idx) ?? -1) + 1;
}

export async function getOrCreateAddress(userId, chain) {
  const chainRow = await getChainByCode(chain);
  if (!chainRow || !chainRow.is_active) {
    throw new Error("Unsupported chain");
  }
  const existing = await getUserChainAddress(userId, chain);
  if (existing && !shouldRotateAddress(existing, chainRow)) return existing;

  // Use a transaction with advisory lock to atomically allocate the index
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const idx = await allocateAddressIndex(client, chain);
    const derived = deriveAddress(chain, idx, chainRow.kind);

    // Insert inside the same transaction (lock is held until COMMIT)
    const { randomUUID } = await import("node:crypto");
    const id = randomUUID();
    await client.query(
      `INSERT INTO wallet_addresses (id, user_id, chain, address, path, idx)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, userId, chain, derived.address, derived.path, idx]
    );

    await client.query("COMMIT");

    const row = await client.query("SELECT * FROM wallet_addresses WHERE id = $1", [id]);
    return row.rows[0] ?? null;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
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
