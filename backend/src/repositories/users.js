import { get, run } from "../db.js";
import { randomUUID } from "node:crypto";

export async function createUser({ handle, email, phone, passwordHash, profileName, profileImageUrl }) {
  const id = randomUUID();
  await run(
    `insert into users (id, handle, email, phone, password_hash, profile_name, profile_image_url)
     values (?,?,?,?,?,?,?)`,
    [
      id,
      handle || null,
      email || null,
      phone || null,
      passwordHash,
      profileName || null,
      profileImageUrl || null
    ]
  );
  return getUserById(id);
}

export async function getUserByEmail(email) {
  return get("select * from users where email = ?", [email]);
}

export async function getUserById(id) {
  return get("select * from users where id = ?", [id]);
}

export async function updateUserRole(id, role) {
  await run("update users set role = ? where id = ?", [role, id]);
  return getUserById(id);
}

export async function updateUserProfile(id, { handle, phone, profileName, profileImageUrl }) {
  await run(
    "update users set handle = ?, phone = ?, profile_name = ?, profile_image_url = ? where id = ?",
    [handle || null, phone || null, profileName || null, profileImageUrl || null, id]
  );
  return getUserById(id);
}

export async function updateUserLastSeen(id) {
  await run("update users set last_seen_at = CURRENT_TIMESTAMP where id = ?", [id]);
}

export async function updateUserPassword(id, passwordHash) {
  await run("update users set password_hash = ? where id = ?", [passwordHash, id]);
  return getUserById(id);
}

export async function setVerification({ userId, code, expiresAt }) {
  await run(
    "update users set verification_code = ?, verification_expires = ?, is_verified = 0 where id = ?",
    [code, expiresAt, userId]
  );
}

export async function verifyUserByCode(email, code) {
  const user = await get("select * from users where email = ?", [email]);
  if (!user) return null;
  if (user.is_verified) return user;
  if (!user.verification_code || !user.verification_expires) return null;
  if (user.verification_code !== code) return null;
  if (new Date(user.verification_expires).getTime() < Date.now()) return null;
  await run("update users set is_verified = 1, verification_code = null, verification_expires = null where id = ?", [
    user.id
  ]);
  return getUserById(user.id);
}
