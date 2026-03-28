import { all, get, run } from "../db.js";
import { randomUUID } from "node:crypto";
import { createFiat, getFiatByCode } from "./fiats.js";
import { createCountry, getCountryByCode } from "./countries.js";

const CHAIN_KIND_OVERRIDES = {
  BTC: "utxo",
  ETH: "evm",
  BNB: "evm",
  SOL: "solana",
  TRX: "tron",
  TRON: "tron",
  XRP: "ripple"
};

function normalizeChainRow(chain) {
  if (!chain) return chain;
  const override = CHAIN_KIND_OVERRIDES[String(chain.code || "").toUpperCase()];
  if (override && chain.kind !== override) {
    return { ...chain, kind: override };
  }
  return chain;
}

export async function listChains() {
  const rows = await all("select * from admin_chains order by created_at desc", []);
  return rows.map((row) => normalizeChainRow(row));
}

export async function listAssets() {
  return all("select * from admin_assets order by created_at desc", []);
}

export async function listActiveAssets() {
  return all(
    "select * from admin_assets where is_active = 1 order by symbol asc",
    []
  );
}

export async function listActiveDepositAssets() {
  return all(
    "select * from admin_assets where is_active = 1 and deposits_enabled = 1 order by symbol asc",
    []
  );
}

export async function listActiveWithdrawalAssets() {
  return all(
    "select * from admin_assets where is_active = 1 and withdrawals_enabled = 1 order by symbol asc",
    []
  );
}

export async function listUsers() {
  return all(
    `select id, email, handle, phone, role, is_verified, created_at
     from users
     order by created_at desc`,
    []
  );
}

export async function getChainByCode(code) {
  const row = await get("select * from admin_chains where code = ?", [code]);
  return normalizeChainRow(row);
}

export async function getAssetBySymbol(symbol) {
  return get("select * from admin_assets where symbol = ?", [symbol]);
}

export async function createChain({ code, name, kind, network, rpcUrl, rpcUrls, isActive = 1 }) {
  const normalizedKind = CHAIN_KIND_OVERRIDES[String(code || "").toUpperCase()] || kind;
  const id = randomUUID();
  await run(
    `insert into admin_chains (id, code, name, kind, network, rpc_url, rpc_urls, is_active)
     values (?,?,?,?,?,?,?,?)`,
    [id, code, name, normalizedKind, network, rpcUrl || null, rpcUrls || null, isActive ? 1 : 0]
  );
  return normalizeChainRow(await get("select * from admin_chains where id = ?", [id]));
}

export async function createAsset({
  symbol,
  name,
  chainCode,
  isNative = 0,
  contractAddress,
  coingeckoId,
  decimals = 18,
  isActive = 1,
  depositsEnabled = 1,
  withdrawalsEnabled = 1,
  feeAddress,
  feeBps
}) {
  const id = randomUUID();
  await run(
    `insert into admin_assets
      (id, symbol, name, chain_code, is_native, contract_address, coingecko_id, decimals, is_active, deposits_enabled, withdrawals_enabled, fee_address, fee_bps)
     values (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      symbol,
      name,
      chainCode,
      isNative ? 1 : 0,
      contractAddress || null,
      coingeckoId || null,
      decimals,
      isActive ? 1 : 0,
      depositsEnabled ? 1 : 0,
      withdrawalsEnabled ? 1 : 0,
      feeAddress || null,
      Number.isFinite(Number(feeBps)) ? Number(feeBps) : 30
    ]
  );
  return get("select * from admin_assets where id = ?", [id]);
}

export async function updateChain(id, fields) {
  const normalized = normalizeFields(fields);
  const keys = Object.keys(normalized);
  if (!keys.length) return get("select * from admin_chains where id = ?", [id]);
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  await run(`update admin_chains set ${setClause} where id = ?`, [...keys.map((k) => normalized[k]), id]);
  return get("select * from admin_chains where id = ?", [id]);
}

export async function updateAsset(id, fields) {
  const normalized = normalizeFields(fields);
  const keys = Object.keys(normalized);
  if (!keys.length) return get("select * from admin_assets where id = ?", [id]);
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  await run(`update admin_assets set ${setClause} where id = ?`, [...keys.map((k) => normalized[k]), id]);
  return get("select * from admin_assets where id = ?", [id]);
}

export async function updateUserRole(id, role) {
  await run("update users set role = ? where id = ?", [role, id]);
  return get(
    "select id, email, handle, phone, role, is_verified, created_at from users where id = ?",
    [id]
  );
}

export async function seedAdminCatalog() {
  const fiats = [
    { code: "USD", name: "US Dollar", symbol: "$" },
    { code: "GHS", name: "Ghana Cedi", symbol: "GHS" },
    { code: "NGN", name: "Nigerian Naira", symbol: "NGN" },
    { code: "KES", name: "Kenyan Shilling", symbol: "KES" },
    { code: "ZAR", name: "South African Rand", symbol: "ZAR" },
    { code: "ZMW", name: "Zambian Kwacha", symbol: "ZMW" }
  ];

  for (const fiat of fiats) {
    const exists = await getFiatByCode(fiat.code);
    if (!exists) {
      await createFiat(fiat);
    }
  }

  const countries = [
    { code: "GH", name: "Ghana", fiatCode: "GHS" },
    { code: "NG", name: "Nigeria", fiatCode: "NGN" },
    { code: "KE", name: "Kenya", fiatCode: "KES" },
    { code: "ZA", name: "South Africa", fiatCode: "ZAR" },
    { code: "ZM", name: "Zambia", fiatCode: "ZMW" }
  ];

  for (const country of countries) {
    const exists = await getCountryByCode(country.code);
    if (!exists) {
      await createCountry(country);
    }
  }

  const chains = [
    { code: "BTC", name: "Bitcoin", kind: "utxo", network: "testnet", rpcUrls: null },
    {
      code: "ETH",
      name: "Ethereum",
      kind: "evm",
      network: "testnet",
      rpcUrls: "https://rpc.sepolia.org,https://ethereum-sepolia-rpc.publicnode.com"
    },
    {
      code: "BNB",
      name: "BNB Chain",
      kind: "evm",
      network: "testnet",
      rpcUrls: "https://bsc-testnet-rpc.publicnode.com,https://bsc-testnet.drpc.org"
    },
    {
      code: "SOL",
      name: "Solana",
      kind: "solana",
      network: "testnet",
      rpcUrls: "https://api.devnet.solana.com,https://api.testnet.solana.com"
    }
  ];

  for (const chain of chains) {
    const exists = await getChainByCode(chain.code);
    if (!exists) {
      await createChain(chain);
    } else if (!exists.rpc_urls && chain.rpcUrls) {
      await updateChain(exists.id, { rpc_urls: chain.rpcUrls });
    }
  }

  const assets = [
    { symbol: "BTC", name: "Bitcoin", chainCode: "BTC", isNative: 1, decimals: 8, coingeckoId: "bitcoin" },
    { symbol: "ETH", name: "Ether", chainCode: "ETH", isNative: 1, decimals: 18, coingeckoId: "ethereum" },
    { symbol: "BNB", name: "BNB", chainCode: "BNB", isNative: 1, decimals: 18, coingeckoId: "binancecoin" },
    { symbol: "SOL", name: "Solana", chainCode: "SOL", isNative: 1, decimals: 9, coingeckoId: "solana" },
    {
      symbol: "USDT",
      name: "Tether USD",
      chainCode: "BNB",
      contractAddress: "0x7ef902d2fd87f34080765277011d0e513511f67f",
      decimals: 18,
      coingeckoId: "tether"
    },
    {
      symbol: "USDC",
      name: "USD Coin",
      chainCode: "BNB",
      contractAddress: "0x8324f87e66a755c8b1439df09e95dfea44d9247d",
      decimals: 18,
      coingeckoId: "usd-coin"
    }
  ];

  for (const asset of assets) {
    const exists = await getAssetBySymbol(asset.symbol);
    if (!exists) {
      await createAsset(asset);
    } else if (!exists.coingecko_id && asset.coingeckoId) {
      await updateAsset(exists.id, { coingecko_id: asset.coingeckoId });
    }
  }
}

function normalizeFields(fields) {
  const out = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}
