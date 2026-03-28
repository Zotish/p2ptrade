/**
 * Admin 2FA (TOTP) Routes
 * Google Authenticator / Authy দিয়ে কাজ করে
 */
import { Router } from "express";
import { createRequire } from "node:module";
import qrcode from "qrcode";
import { requireAdmin } from "../auth.js";
import { run, get } from "../db.js";

// speakeasy is CJS — load via createRequire
const require = createRequire(import.meta.url);
const speakeasy = require("speakeasy");

export const twofaRouter = Router();

// ── Setup — QR code generate করো ─────────────────────────────────
twofaRouter.post("/setup", requireAdmin, async (req, res) => {
  try {
    const user = get("select id, email, totp_enabled from users where id = ?", [req.user.id]);
    if (user?.totp_enabled) {
      return res.status(400).json({ error: "2FA is already enabled. Disable it first." });
    }

    // নতুন secret generate করো
    const secretObj = speakeasy.generateSecret({
      name: `P2P Escrow (${user.email})`
    });

    // Temporarily save secret (not yet enabled)
    run("update users set totp_secret = ? where id = ?", [secretObj.base32, req.user.id]);

    // QR code image generate করো
    const qrDataUrl = await qrcode.toDataURL(secretObj.otpauth_url);

    res.json({
      secret: secretObj.base32,  // Manual entry-এর জন্য
      qrCode: qrDataUrl           // Scan করার জন্য
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Enable — code verify করে 2FA চালু করো ───────────────────────
twofaRouter.post("/enable", requireAdmin, async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: "Verification code required" });

  try {
    const user = get("select totp_secret, totp_enabled from users where id = ?", [req.user.id]);
    if (!user?.totp_secret) {
      return res.status(400).json({ error: "Run /2fa/setup first to get your secret" });
    }
    if (user.totp_enabled) {
      return res.status(400).json({ error: "2FA is already enabled" });
    }

    const valid = speakeasy.totp.verify({
      secret: user.totp_secret,
      encoding: "base32",
      token: String(code),
      window: 1
    });
    if (!valid) return res.status(400).json({ error: "Invalid code. Try again." });

    run("update users set totp_enabled = 1 where id = ?", [req.user.id]);
    res.json({ ok: true, message: "2FA enabled successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Verify — login-এর পরে 2FA code check ─────────────────────────
twofaRouter.post("/verify", requireAdmin, async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: "Code required" });

  try {
    const user = get("select totp_secret, totp_enabled from users where id = ?", [req.user.id]);
    if (!user?.totp_enabled) {
      return res.status(400).json({ error: "2FA is not enabled for this account" });
    }

    const valid = speakeasy.totp.verify({
      secret: user.totp_secret,
      encoding: "base32",
      token: String(code),
      window: 1
    });
    if (!valid) return res.status(401).json({ error: "Invalid 2FA code" });

    res.json({ ok: true, verified: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Disable — 2FA বন্ধ করো ───────────────────────────────────────
twofaRouter.post("/disable", requireAdmin, async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: "Current 2FA code required to disable" });

  try {
    const user = get("select totp_secret, totp_enabled from users where id = ?", [req.user.id]);
    if (!user?.totp_enabled) {
      return res.status(400).json({ error: "2FA is not enabled" });
    }

    const valid = speakeasy.totp.verify({
      secret: user.totp_secret,
      encoding: "base32",
      token: String(code),
      window: 1
    });
    if (!valid) return res.status(401).json({ error: "Invalid 2FA code" });

    run("update users set totp_enabled = 0, totp_secret = null where id = ?", [req.user.id]);
    res.json({ ok: true, message: "2FA disabled" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Status — 2FA চালু আছে কিনা দেখো ─────────────────────────────
twofaRouter.get("/status", requireAdmin, (req, res) => {
  const user = get("select totp_enabled from users where id = ?", [req.user.id]);
  res.json({ enabled: !!user?.totp_enabled });
});
