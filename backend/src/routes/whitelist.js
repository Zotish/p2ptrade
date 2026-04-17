/**
 * Withdrawal Address Whitelist
 * User নিজের trusted withdrawal addresses এখানে save করতে পারে।
 * 2FA enabled থাকলে add/delete-এ TOTP verify করে।
 */
import { Router } from "express";
import { createRequire } from "node:module";
import { requireAuth } from "../auth.js";
import { run, get, all } from "../db.js";
import { randomUUID } from "node:crypto";

const _require = createRequire(import.meta.url);
const speakeasy = _require("speakeasy");

export const whitelistRouter = Router();

// ── List user's whitelisted addresses ─────────────────────────────
whitelistRouter.get("/", requireAuth, async (req, res) => {
  try {
    const rows = await all(
      "select * from withdrawal_whitelist where user_id = ? order by created_at desc",
      [req.user.id]
    );
    res.json({ whitelist: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Add address to whitelist ──────────────────────────────────────
whitelistRouter.post("/", requireAuth, async (req, res) => {
  const { chain, address, label, totpCode } = req.body || {};
  if (!chain || !address) {
    return res.status(400).json({ error: "chain and address required" });
  }
  if (String(address).length > 200) {
    return res.status(400).json({ error: "Address too long" });
  }

  try {
    // 2FA check if enabled
    const user = await get("select totp_enabled, totp_secret from users where id = $1", [req.user.id]);
    if (user?.totp_enabled) {
      if (!totpCode) {
        return res.status(400).json({ error: "2FA code required", requires2fa: true });
      }
      const valid = speakeasy.totp.verify({
        secret: user.totp_secret,
        encoding: "base32",
        token: String(totpCode).replace(/\s/g, ""),
        window: 1
      });
      if (!valid) {
        return res.status(401).json({ error: "Invalid 2FA code", requires2fa: true });
      }
    }

    // Check duplicate
    const existing = await get(
      "select id from withdrawal_whitelist where user_id = ? and chain = ? and address = ?",
      [req.user.id, chain, address]
    );
    if (existing) {
      return res.status(409).json({ error: "This address is already in your whitelist" });
    }

    const id = randomUUID();
    await run(
      "insert into withdrawal_whitelist (id, user_id, chain, address, label) values (?,?,?,?,?)",
      [id, req.user.id, String(chain).toUpperCase(), address, String(label || "").slice(0, 100)]
    );
    const row = await get("select * from withdrawal_whitelist where id = ?", [id]);
    res.status(201).json({ entry: row });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Remove address from whitelist ─────────────────────────────────
whitelistRouter.delete("/:id", requireAuth, async (req, res) => {
  const { totpCode } = req.body || {};
  try {
    const entry = await get(
      "select * from withdrawal_whitelist where id = ? and user_id = ?",
      [req.params.id, req.user.id]
    );
    if (!entry) return res.status(404).json({ error: "Entry not found" });

    // 2FA check if enabled
    const user = await get("select totp_enabled, totp_secret from users where id = $1", [req.user.id]);
    if (user?.totp_enabled) {
      if (!totpCode) {
        return res.status(400).json({ error: "2FA code required to remove address", requires2fa: true });
      }
      const valid = speakeasy.totp.verify({
        secret: user.totp_secret,
        encoding: "base32",
        token: String(totpCode).replace(/\s/g, ""),
        window: 1
      });
      if (!valid) {
        return res.status(401).json({ error: "Invalid 2FA code", requires2fa: true });
      }
    }

    await run("delete from withdrawal_whitelist where id = ? and user_id = ?", [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
