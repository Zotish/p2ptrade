import { config } from "../config.js";
import { run } from "../db.js";
import { listActiveAssets } from "../repositories/admin.js";
import { listFiats } from "../repositories/fiats.js";

const tokenIdMap = {
  BTC: "bitcoin",
  ETH: "ethereum",
  USDT: "tether",
  USDC: "usd-coin",
  BNB: "binancecoin",
  SOL: "solana"
};

let cryptoCache = { at: 0, data: {} };
let fxCache = { at: 0, data: {} };

const CACHE_MS = config.priceCacheMs;

export async function getMarketPrice(token) {
  const prices = await getCryptoPrices([token]);
  const key = token?.toUpperCase();
  const price = prices[key];
  if (!price) {
    throw new Error(`No CoinGecko price for ${key || "token"}`);
  }
  return price;
}

export async function getCryptoPrices(tokens) {
  const assets = await listActiveAssets();
  return getCryptoPricesForAssets(
    tokens.map((token) => assets.find((asset) => asset.symbol === token.toUpperCase()) || { symbol: token.toUpperCase() })
  );
}

export async function getCryptoPricesForAssets(assets) {
  const now = Date.now();
  if (now - cryptoCache.at < CACHE_MS && Object.keys(cryptoCache.data).length) {
    const missing = assets
      .map((asset) => asset.symbol.toUpperCase())
      .filter((t) => !cryptoCache.data[t]);
    if (missing.length === 0) {
      return cryptoCache.data;
    }
  }

  const resolvedAssets = assets.map((asset) => {
    const symbol = asset.symbol.toUpperCase();
    return {
      ...asset,
      symbol,
      coingeckoId: asset.coingecko_id || tokenIdMap[symbol] || null
    };
  });

  const stableOnly = resolvedAssets.every((asset) =>
    ["USDT", "USDC", "USDS", "BUSD", "DAI"].includes(asset.symbol)
  );
  const ids = resolvedAssets.map((asset) => asset.coingeckoId).filter(Boolean);
  if (!ids.length && !stableOnly) return {};

  if (!config.coingeckoApiKey && ids.length) {
    throw new Error("Missing COINGECKO_API_KEY");
  }

  const url = new URL(`${config.coingeckoBaseUrl}/simple/price`);
  if (ids.length) {
    url.searchParams.set("ids", ids.join(","));
    url.searchParams.set("vs_currencies", "usd");
    url.searchParams.set("include_last_updated_at", "true");
  }

  const isPro = config.coingeckoBaseUrl.includes("pro-api.coingecko.com");
  const headerName = isPro ? "x-cg-pro-api-key" : "x-cg-demo-api-key";

  let json = {};
  if (ids.length) {
    const first = await fetchCoinGecko(url, { [headerName]: config.coingeckoApiKey });
    json = first.json;

    if (!hasAnyPrice(json)) {
      const second = await fetchCoinGecko(url, {});
      json = second.json;
    }
  }

  const data = {};
  for (const asset of resolvedAssets) {
    const symbol = asset.symbol;
    const id = asset.coingeckoId;
    const entry = id ? json?.[id] : null;
    if (entry?.usd) {
      data[symbol] = { token: symbol, usd: entry.usd, source: "coingecko" };
      savePriceTick(symbol, entry.usd, "coingecko");
      continue;
    }
    if (isStablecoinSymbol(symbol)) {
      data[symbol] = { token: symbol, usd: 1, source: "stablecoin-fallback" };
    }
  }

  if (!Object.keys(data).length) {
    const message = json?.error || json?.status?.error_message || "CoinGecko returned no prices";
    throw new Error(message);
  }

  cryptoCache = { at: now, data };
  return data;
}

export async function getFxRates() {
  const now = Date.now();
  if (now - fxCache.at < CACHE_MS && Object.keys(fxCache.data).length) {
    return fxCache.data;
  }

  const fiats = await listFiats(true);
  const symbols = fiats
    .map((f) => f.code)
    .filter((code) => code && code.toUpperCase() !== "USD");
  if (!symbols.length) {
    fxCache = { at: now, data: {} };
    return fxCache.data;
  }

  const url = new URL(`${config.fxBaseUrl}/latest/USD`);
  const response = await safeFetch(url);
  if (!response.ok) {
    throw new Error(`FX error: ${response.status}`);
  }
  const json = await response.json();
  const rates = json.rates || {};

  const data = {};
  for (const quote of symbols) {
    const rate = rates[quote];
    if (rate) {
      data[quote] = Number(rate);
      saveFxTick("USD", quote, Number(rate), "open-er-api");
    }
  }

  fxCache = { at: now, data };
  return data;
}

function savePriceTick(token, usdPrice, source) {
  try {
    run("insert into price_ticks (token, usd_price, source) values (?,?,?)", [
      token,
      usdPrice,
      source
    ]);
  } catch {
    // ignore if db not ready
  }
}

function saveFxTick(base, quote, rate, source) {
  try {
    run("insert into fx_ticks (base, quote, rate, source) values (?,?,?,?)", [
      base,
      quote,
      rate,
      source
    ]);
  } catch {
    // ignore if db not ready
  }
}

async function safeFetch(url, timeoutMs = 8000, headers = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal, headers });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchCoinGecko(url, headers) {
  const response = await safeFetch(url, 10000, {
    "accept": "application/json",
    "user-agent": "p2p-escrow/1.0",
    ...headers
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`CoinGecko error: ${response.status} ${body}`.trim());
  }
  const json = await response.json();
  if (json?.status?.error_message) {
    throw new Error(json.status.error_message);
  }
  return { json };
}

function hasAnyPrice(json) {
  if (!json || typeof json !== "object") return false;
  return Object.values(json).some((entry) => entry && typeof entry.usd === "number");
}

function isStablecoinSymbol(symbol) {
  return ["USDT", "USDC", "USDS", "BUSD", "DAI"].includes(String(symbol || "").toUpperCase());
}
