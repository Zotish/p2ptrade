// build: 2026-04-19
import * as Sentry from "@sentry/node";
import express from "express";

// ── Unhandled rejection safety net — server crash হবে না ─────────
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err.message);
});

// ── Critical environment variable validation ──────────────────────
const REQUIRED_VARS = ["DATABASE_URL", "JWT_SECRET", "WALLET_MNEMONIC"];
const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
if (missing.length) {
  console.error(`[startup] ❌ Missing critical environment variables: ${missing.join(", ")}`);
  console.error("[startup] Server cannot start safely. Set these in Railway environment variables.");
  process.exit(1);
}
if (process.env.JWT_SECRET === "dev_change_me" || (process.env.JWT_SECRET || "").length < 32) {
  console.error("[startup] ❌ JWT_SECRET is too weak or default. Use a random 64-char string.");
  process.exit(1);
}
console.log("[startup] ✅ Environment validation passed");
import { createServer } from "node:http";
import path from "node:path";
import fs from "node:fs";
import cors from "cors";
import { initSocket } from "./socket.js";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config.js";
import { healthRouter } from "./routes/health.js";
import { offersRouter } from "./routes/offers.js";
import { ordersRouter } from "./routes/orders.js";
import { authRouter } from "./routes/auth.js";
import { startRefundScheduler } from "./services/refundScheduler.js";
import { runMigrations } from "./migrations.js";
import { walletsRouter } from "./routes/wallets.js";
import { startWatchers } from "./services/watchers/index.js";
import { marketRouter } from "./routes/market.js";
import { scanRouter } from "./routes/scan.js";
import { adminRouter } from "./routes/admin.js";
import { seedAdminCatalog } from "./repositories/admin.js";
import { chatRouter } from "./routes/chat.js";
import { generalLimiter } from "./middleware/rateLimiter.js";
import { startBackupScheduler } from "./services/backupScheduler.js";
import { twofaRouter } from "./routes/twofa.js";
import { whitelistRouter } from "./routes/whitelist.js";

// ── Sentry Error Tracking ─────────────────────────────────────────
if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    environment: process.env.NODE_ENV || "production",
    tracesSampleRate: 0.1,
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration()
    ],
    beforeSend(event) {
      // Don't send 4xx client errors to Sentry (too noisy)
      const status = event?.contexts?.response?.status_code;
      if (status && status < 500) return null;
      return event;
    }
  });
  console.log("[sentry] ✅ Error tracking enabled (DSN configured)");
} else {
  console.log("[sentry] ℹ️  SENTRY_DSN not set — error tracking disabled");
}

const app = express();
const httpServer = createServer(app);

app.set("etag", false);
app.set("trust proxy", 1); // Railway/Netlify proxy-এর পেছনে আছে
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

// ── Global Rate Limiter ───────────────────────────────────────────
app.use(generalLimiter);

const uploadsDir = path.join(process.cwd(), "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir));

// ── DB ready flag ─────────────────────────────────────────────────
let dbReady = false;

// ── Frontend static files (production/ngrok mode) ─────────────────
const __dirname  = path.dirname(new URL(import.meta.url).pathname);
const frontendDist = path.resolve(__dirname, "../../frontend/dist");

if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  console.log("[static] Serving frontend from", frontendDist);
} else {
  // Dev mode — no build yet
  app.get("/", (req, res) => {
    res.json({
      name: "p2p-backend",
      status: dbReady ? "ok" : "starting",
      message: dbReady ? "P2P escrow API running" : "Server starting, please wait..."
    });
  });
}

app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/2fa", twofaRouter);
app.use("/wallets/whitelist", whitelistRouter);  // must be BEFORE /wallets
app.use("/wallets", walletsRouter);
app.use("/market", marketRouter);
app.use("/scan", scanRouter);
app.use("/admin", adminRouter);
app.use("/chat", chatRouter);
app.use("/offers", offersRouter);
app.use("/orders", ordersRouter);

// ── Sentry Error Handler (routes এর পরে আসবে) ────────────────────
if (config.sentryDsn) {
  Sentry.setupExpressErrorHandler(app);
}

// ── React Router catch-all — frontend build থাকলে index.html দাও ──
if (fs.existsSync(frontendDist)) {
  app.use((req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
} else {
  app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
  });
}

// ── Global Error Handler ──────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error("[error]", err);
  if (config.sentryDsn) Sentry.captureException(err);
  res.status(500).json({ error: "Internal server error" });
});

initSocket(httpServer);

// ── DB health check: প্রতি 2 মিনিটে tables আছে কিনা দেখো ──────
// DB delete হলে auto-heal করে migrations+seed re-run করবে
let watchersStarted = false;
async function dbHealthCheck() {
  try {
    const { get } = await import("./db.js");
    // যদি users table না থাকে তাহলে DB মুছে ফেলা হয়েছে বুঝতে হবে
    await get("SELECT 1 FROM users LIMIT 1", []);
  } catch (_) {
    console.log("[db-heal] Tables missing — re-running migrations & seed...");
    try {
      await runMigrations();
      await seedAdminCatalog();
      dbReady = true;
      if (!watchersStarted) {
        watchersStarted = true;
        startRefundScheduler();
        startBackupScheduler();
        startWatchers();
      }
      console.log("[db-heal] ✅ Database restored successfully");
    } catch (healErr) {
      console.error("[db-heal] ❌ Heal failed:", healErr.message);
    }
  }
}

// ── Port-এ listen করো আগে, তারপর DB init background-এ ──────────
httpServer.listen(config.port, () => {
  console.log(`API listening on :${config.port}`);

  // Background-এ migrations + seed + watchers চালাও
  (async () => {
    try {
      console.log("[db] Running migrations...");
      await runMigrations();
      console.log("[db] ✅ Migrations done");

      await seedAdminCatalog();
      console.log("[db] ✅ Catalog seeded");

      dbReady = true;
      watchersStarted = true;

      startRefundScheduler();
      startBackupScheduler();
      startWatchers();
    } catch (err) {
      console.error("[db] ❌ Startup error:", err.message);
      process.exit(1);
    }
  })();

  // প্রতি 2 মিনিটে DB health check
  setInterval(dbHealthCheck, 2 * 60 * 1000);
});
