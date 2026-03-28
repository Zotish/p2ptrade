import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs";
import { comparePassword, getUserRole, hashPassword, signAccessToken, signRefreshToken, verifyToken } from "../auth.js";
import { createUser, getUserByEmail, setVerification, verifyUserByCode, updateUserProfile, updateUserPassword, getUserById, updateUserLastSeen } from "../repositories/users.js";
import { config } from "../config.js";
import { sendVerificationEmail } from "../services/emailService.js";
import { authLimiter, signupLimiter, verifyLimiter } from "../middleware/rateLimiter.js";

export const authRouter = Router();

const uploadsDir = path.join(process.cwd(), "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  }
});

function getUploadPathFromUrl(url) {
  if (!url) return null;
  const idx = url.lastIndexOf("/uploads/");
  if (idx === -1) return null;
  const filename = url.slice(idx + "/uploads/".length);
  if (!filename || filename.includes("..")) return null;
  return path.join(uploadsDir, filename);
}

function requireAuthUser(req, res, next) {
  const token = req.cookies?.access_token;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const payload = verifyToken(token);
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function setAuthCookies(res, payload) {
  const access = signAccessToken(payload);
  const refresh = signRefreshToken(payload);
  const options = {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: config.cookieSameSite,
    path: "/"
  };
  res.cookie("access_token", access, { ...options, maxAge: 15 * 60 * 1000 });
  res.cookie("refresh_token", refresh, { ...options, maxAge: 30 * 24 * 60 * 60 * 1000 });
}

authRouter.post("/signup", signupLimiter, async (req, res) => {
  const { email, password, handle, phone, profileImageUrl } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }
  if (config.adminLoginEmail && String(email).toLowerCase() === config.adminLoginEmail) {
    return res.status(403).json({ error: "This email is reserved for admin login" });
  }
  const existing = await getUserByEmail(email);
  if (existing) {
    return res.status(409).json({ error: "Email already in use" });
  }
  const passwordHash = await hashPassword(password);
  const user = await createUser({ email, passwordHash, handle, phone, profileImageUrl });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await setVerification({ userId: user.id, code, expiresAt });
  await sendVerificationEmail({ email, code });
  res.status(201).json({
    user: {
      id: user.id,
      email: user.email,
      handle: user.handle,
      profile_name: user.profile_name,
      profile_image_url: user.profile_image_url
    }
  });
});

authRouter.post("/login", authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }
  const normalizedEmail = String(email).toLowerCase();
  if (
    config.adminLoginEmail &&
    config.adminLoginPassword &&
    normalizedEmail === config.adminLoginEmail &&
    password === config.adminLoginPassword
  ) {
    const payload = { id: "admin-fixed", email: config.adminLoginEmail, role: "admin" };
    setAuthCookies(res, payload);
    return res.json({
      user: { id: payload.id, email: payload.email, handle: "admin", role: "admin" }
    });
  }
  const user = await getUserByEmail(normalizedEmail);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  if (!user.is_verified) return res.status(403).json({ error: "Email not verified" });
  const ok = await comparePassword(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });
  const role = getUserRole(user);
  const payload = { id: user.id, email: user.email, role };
  setAuthCookies(res, payload);
  await updateUserLastSeen(user.id);
  // auto rescan recent blocks for missed deposits
  try {
    const { scanRecentForUser } = await import("../services/scanRecent.js");
    scanRecentForUser(user.id, 2000).catch((e) => console.error("Recent scan error", e.message));
  } catch {}
  res.json({
    user: {
      id: user.id,
      email: user.email,
      handle: user.handle,
      role,
      phone: user.phone,
      profile_name: user.profile_name,
      profile_image_url: user.profile_image_url
    }
  });
});

authRouter.post("/verify", verifyLimiter, async (req, res) => {
  const { email, code } = req.body || {};
  if (!email || !code) {
    return res.status(400).json({ error: "Email and code required" });
  }
  const user = await verifyUserByCode(email, code);
  if (!user) return res.status(400).json({ error: "Invalid or expired code" });
  const role = getUserRole(user);
  const payload = { id: user.id, email: user.email, role };
  setAuthCookies(res, payload);
  await updateUserLastSeen(user.id);
  try {
    const { scanRecentForUser } = await import("../services/scanRecent.js");
    scanRecentForUser(user.id, 2000).catch((e) => console.error("Recent scan error", e.message));
  } catch {}
  res.json({
    user: {
      id: user.id,
      email: user.email,
      handle: user.handle,
      role,
      phone: user.phone,
      profile_name: user.profile_name,
      profile_image_url: user.profile_image_url
    }
  });
});

authRouter.post("/resend", async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "Email required" });
  const user = await getUserByEmail(email);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.is_verified) return res.status(409).json({ error: "Already verified" });
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  await setVerification({ userId: user.id, code, expiresAt });
  await sendVerificationEmail({ email, code });
  res.json({ ok: true });
});

authRouter.post("/refresh", async (req, res) => {
  const token = req.cookies?.refresh_token;
  if (!token) return res.status(401).json({ error: "Missing refresh token" });
  try {
    const payload = verifyToken(token);
    setAuthCookies(res, { id: payload.id, email: payload.email, role: payload.role || "user" });
    res.json({ ok: true });
  } catch {
    res.status(401).json({ error: "Invalid refresh token" });
  }
});

authRouter.post("/upload/profile", requireAuthUser, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Missing file" });
    const current = await getUserById(req.user.id);
    if (!current) return res.status(404).json({ error: "User not found" });
    const filename = `${req.user.id}-${Date.now()}.webp`;
    const filepath = path.join(uploadsDir, filename);
    await sharp(req.file.buffer)
      .resize(256, 256, { fit: "cover" })
      .webp({ quality: 80 })
      .toFile(filepath);
    const url = `${req.protocol}://${req.get("host")}/uploads/${filename}`;
    const oldPath = getUploadPathFromUrl(current.profile_image_url);
    if (oldPath && fs.existsSync(oldPath)) {
      try {
        fs.unlinkSync(oldPath);
      } catch {}
    }
    const user = await updateUserProfile(req.user.id, {
      handle: current.handle,
      phone: current.phone,
      profileName: current.profile_name,
      profileImageUrl: url
    });
    res.json({
      url,
      user: {
        id: user.id,
        email: user.email,
        handle: user.handle,
        phone: user.phone,
        profile_name: user.profile_name,
        profile_image_url: user.profile_image_url
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

authRouter.post("/logout", (req, res) => {
  res.clearCookie("access_token", { path: "/" });
  res.clearCookie("refresh_token", { path: "/" });
  res.json({ ok: true });
});

authRouter.get("/me", async (req, res) => {
  const token = req.cookies?.access_token;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const payload = verifyToken(token);
    if (payload.role === "admin") {
      return res.json({
        user: { id: payload.id, email: payload.email, role: payload.role || "admin", handle: "admin" }
      });
    }
    const user = await getUserById(payload.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    await updateUserLastSeen(user.id);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: payload.role || "user",
        handle: user.handle,
        phone: user.phone,
        profile_name: user.profile_name,
        profile_image_url: user.profile_image_url
      }
    });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

authRouter.patch("/profile", async (req, res) => {
  const token = req.cookies?.access_token;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const payload = verifyToken(token);
    const { handle, phone, profileName, profileImageUrl } = req.body || {};
    const user = await updateUserProfile(payload.id, {
      handle,
      phone,
      profileName,
      profileImageUrl
    });
    res.json({
      user: {
        id: user.id,
        email: user.email,
        handle: user.handle,
        phone: user.phone,
        profile_name: user.profile_name,
        profile_image_url: user.profile_image_url
      }
    });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

authRouter.patch("/password", async (req, res) => {
  const token = req.cookies?.access_token;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const payload = verifyToken(token);
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "currentPassword and newPassword required" });
    }
    const user = await getUserById(payload.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    const ok = await comparePassword(currentPassword, user.password_hash);
    if (!ok) return res.status(403).json({ error: "Current password incorrect" });
    const hash = await hashPassword(newPassword);
    await updateUserPassword(payload.id, hash);
    res.json({ ok: true });
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});
