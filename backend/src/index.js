import * as Sentry from "@sentry/node";
import express from "express";

// ── Unhandled rejection safety net — server crash হবে না ─────────
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err.message);
});
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

// ── Sentry Error Tracking (DSN থাকলে চালু হবে) ──────────────────
if (config.sentryDsn) {
  Sentry.init({
    dsn: config.sentryDsn,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.2
  });
  console.log("[sentry] ✅ Error tracking enabled");
}

const app = express();
const httpServer = createServer(app);

app.set("etag", false);
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
app.use("/wallets", walletsRouter);
app.use("/market", marketRouter);
app.use("/scan", scanRouter);
app.use("/admin", adminRouter);
app.use("/chat", chatRouter);
app.use("/offers", offersRouter);
app.use("/orders", ordersRouter);

// ── Sentry Error Handler (routes এর পরে আসবে) ────────────────────
if (config.sentryDsn) {
  app.use(Sentry.expressErrorHandler());
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

      startRefundScheduler();
      startBackupScheduler();
      startWatchers();
    } catch (err) {
      console.error("[db] ❌ Startup error:", err.message);
      process.exit(1);
    }
  })();
});
