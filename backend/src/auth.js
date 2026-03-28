import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { config } from "./config.js";
import { get } from "./db.js";

export function signAccessToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "15m" });
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "30d" });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export async function requireAuth(req, res, next) {
  const authHeader = req.headers?.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const token = bearerToken || req.cookies?.access_token;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    req.user = verifyToken(token);
    const dbUser = await get("select is_frozen, freeze_reason from users where id = $1", [req.user.id]);
    if (dbUser?.is_frozen) {
      return res.status(403).json({
        error: "Account frozen",
        reason: dbUser.freeze_reason || "Your account has been suspended. Contact support."
      });
    }
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export async function requireAdmin(req, res, next) {
  const authHeader = req.headers?.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const token = bearerToken || req.cookies?.access_token;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    req.user = verifyToken(token);
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function getUserRole(user) {
  if (!user) return "user";
  if (user.role) return user.role;
  if (config.adminEmail && user.email?.toLowerCase() === config.adminEmail) {
    return "admin";
  }
  return "user";
}
