/**
 * Backup Scheduler — PostgreSQL (Neon) database backup
 * ─────────────────────────────────────────────────────
 * • Neon-এর built-in PITR আছে, কিন্তু manual snapshot-ও নেওয়া ভালো।
 * • প্রতি 6 ঘণ্টায় pg_dump চালায় এবং ./backups/ folder-এ save করে।
 * • Railway-তে persistent volume না থাকলে backup external storage-এ পাঠানো উচিত।
 * • BACKUP_WEBHOOK_URL set থাকলে সেই URL-এ backup status POST করে।
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createGzip } from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

const execFileAsync = promisify(execFile);

const BACKUP_DIR = path.resolve(process.cwd(), "backups");
const BACKUP_INTERVAL_MS = 6 * 60 * 60 * 1000;  // 6 ঘণ্টা
const MAX_BACKUPS = 12;  // রাখব সর্বোচ্চ 12টা (3 দিনের)

function ensureBackupDir() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function getBackupFileName() {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(BACKUP_DIR, `backup-${ts}.sql.gz`);
}

function pruneOldBackups() {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith("backup-") && f.endsWith(".sql.gz"))
      .map((f) => ({ name: f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);

    const toDelete = files.slice(MAX_BACKUPS);
    for (const f of toDelete) {
      fs.unlinkSync(path.join(BACKUP_DIR, f.name));
      console.log(`[backup] Deleted old backup: ${f.name}`);
    }
  } catch (err) {
    console.error("[backup] Prune error:", err.message);
  }
}

export async function runBackup() {
  if (!config.databaseUrl || !config.databaseUrl.startsWith("postgres")) {
    console.log("[backup] Skipping — not a PostgreSQL database");
    return;
  }

  ensureBackupDir();
  const outFile = getBackupFileName();

  console.log(`[backup] Starting pg_dump → ${path.basename(outFile)}`);

  try {
    // pg_dump available হলে use করো, otherwise Neon PITR-এর উপর depend করো
    const { stdout } = await execFileAsync("pg_dump", [
      "--dbname", config.databaseUrl,
      "--format", "plain",
      "--no-owner",
      "--no-acl",
      "--quote-all-identifiers"
    ], {
      env: { ...process.env, PGPASSWORD: new URL(config.databaseUrl).password || "" },
      maxBuffer: 100 * 1024 * 1024,   // 100MB max
      timeout: 5 * 60 * 1000          // 5 minute timeout
    });

    // Compress with gzip
    await new Promise((resolve, reject) => {
      const ws = fs.createWriteStream(outFile);
      const gz = createGzip({ level: 6 });
      gz.pipe(ws);
      gz.write(stdout);
      gz.end();
      ws.on("finish", resolve);
      ws.on("error", reject);
    });

    const stats = fs.statSync(outFile);
    const sizeMb = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`[backup] ✅ Backup complete: ${path.basename(outFile)} (${sizeMb} MB)`);

    pruneOldBackups();

    // Optional: notify via webhook
    const webhookUrl = process.env.BACKUP_WEBHOOK_URL;
    if (webhookUrl) {
      fetch(webhookUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event: "backup_complete",
          file: path.basename(outFile),
          sizeMb: Number(sizeMb),
          ts: new Date().toISOString()
        })
      }).catch(() => {});
    }
  } catch (err) {
    if (err.code === "ENOENT") {
      // pg_dump not installed — Neon-এর automatic PITR-এর উপর depend করো
      console.log("[backup] pg_dump not found. Relying on Neon PITR (automatic cloud backup).");
      console.log("[backup] ℹ️  To enable manual backups: install postgresql-client on the server.");
    } else {
      console.error("[backup] ❌ Backup failed:", err.message);
    }
  }
}

export function startBackupScheduler() {
  if (!config.databaseUrl || !config.databaseUrl.startsWith("postgres")) {
    console.log("[backup] Not PostgreSQL — scheduler disabled");
    return;
  }

  console.log(`[backup] Scheduler started — running every ${BACKUP_INTERVAL_MS / 3600000}h`);

  // Initial backup on startup (delayed 2 min to let DB settle)
  setTimeout(async () => {
    await runBackup();
  }, 2 * 60 * 1000);

  setInterval(async () => {
    await runBackup();
  }, BACKUP_INTERVAL_MS);
}
