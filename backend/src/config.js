import "dotenv/config";

function parseList(value, fallback = "") {
  return String(value || fallback)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT || 4000),
  corsOrigin: (process.env.CORS_ORIGIN || "*").includes(",")
    ? process.env.CORS_ORIGIN.split(",").map(s => s.trim())
    : process.env.CORS_ORIGIN || "*",
  escrowTimeoutMinutes: Number(process.env.ESCROW_TIMEOUT_MINUTES || 90),
  databaseUrl: process.env.DATABASE_URL || "sqlite://./data/p2p.db",
  coingeckoBaseUrl: process.env.COINGECKO_BASE_URL || "https://api.coingecko.com/api/v3",
  coingeckoApiKey: process.env.COINGECKO_API_KEY || "",
  fxBaseUrl: process.env.FX_BASE_URL || "https://open.er-api.com/v6",
  fxSymbols: (process.env.FX_SYMBOLS || "GHS,NGN,KES,ZAR,ZMW").split(","),
  jwtSecret: process.env.JWT_SECRET || "dev_change_me",
  adminEmail: (process.env.ADMIN_EMAIL || "").toLowerCase(),
  adminLoginEmail: (process.env.ADMIN_LOGIN_EMAIL || process.env.ADMIN_EMAIL || "").toLowerCase(),
  adminLoginPassword: process.env.ADMIN_LOGIN_PASSWORD || "",
  cookieSecure: process.env.COOKIE_SECURE === "true",
  cookieSameSite: process.env.COOKIE_SAMESITE || "lax",
  walletMnemonic: process.env.WALLET_MNEMONIC || "",
  ethRpcUrl: process.env.ETH_RPC_URL || "",
  ethRpcUrls: parseList(process.env.ETH_RPC_URLS, process.env.ETH_RPC_URL || ""),
  bscRpcUrl: process.env.BSC_RPC_URL || "",
  bscRpcUrls: parseList(process.env.BSC_RPC_URLS, process.env.BSC_RPC_URL || ""),
  btcRpcUrl: process.env.BTC_RPC_URL || "",
  btcApiUrls: parseList(
    process.env.BTC_API_URLS,
    process.env.BTC_NETWORK === "mainnet"
      ? "https://mempool.space/api,https://blockstream.info/api"
      : "https://mempool.space/testnet/api,https://blockstream.info/testnet/api"
  ),
  solRpcUrl: process.env.SOL_RPC_URL || "",
  solRpcUrls: parseList(process.env.SOL_RPC_URLS, process.env.SOL_RPC_URL || ""),
  tronRpcUrl: process.env.TRON_RPC_URL || "",
  tronRpcUrls: parseList(process.env.TRON_RPC_URLS, process.env.TRON_RPC_URL || ""),
  rippleRpcUrl: process.env.RIPPLE_RPC_URL || "",
  rippleRpcUrls: parseList(process.env.RIPPLE_RPC_URLS, process.env.RIPPLE_RPC_URL || ""),
  priceCacheMs: Number(process.env.PRICE_CACHE_MS || 0),
  btcNetwork: process.env.BTC_NETWORK || "testnet",
  treasuryIndex: Number(process.env.TREASURY_INDEX || 1000000),
  // Confirmations — mainnet-safe defaults
  confBtc:    Number(process.env.CONFIRMATIONS_BTC    || 3),   // BTC: ~30min
  confEvm:    Number(process.env.CONFIRMATIONS_EVM    || 12),  // ETH/BNB: ~3min
  confSol:    Number(process.env.CONFIRMATIONS_SOL    || 32),  // SOL: ~15s
  confTron:   Number(process.env.CONFIRMATIONS_TRON   || 20),  // TRX: ~1min
  confRipple: Number(process.env.CONFIRMATIONS_RIPPLE || 3),   // XRP: ~4s
  // Withdrawal limits per user per 24h
  withdrawalDailyMaxCount:  Number(process.env.WITHDRAWAL_DAILY_MAX_COUNT  || 5),
  withdrawalDailyMaxAmount: Number(process.env.WITHDRAWAL_DAILY_MAX_AMOUNT || 0), // 0 = no limit
  // Email
  resendApiKey: process.env.RESEND_API_KEY || "",
  emailFrom: process.env.EMAIL_FROM || "P2P Escrow <onboarding@resend.dev>",
  // Error Tracking (Sentry)
  sentryDsn: process.env.SENTRY_DSN || ""
};
