import { all, run } from "../db.js";
import { randomUUID } from "node:crypto";

/**
 * Audit log — every admin action এখানে record হয়।
 * action examples: approve_withdrawal, reject_withdrawal, freeze_user, unfreeze_user,
 *                  resolve_dispute_release, resolve_dispute_refund, treasury_withdraw
 */
export async function logAudit({ actorId, actorEmail, action, targetId, targetType, meta, ip }) {
  try {
    const id = randomUUID();
    await run(
      `insert into audit_log
         (id, actor_id, actor_email, action, target_id, target_type, meta, ip)
       values (?,?,?,?,?,?,?,?)`,
      [
        id,
        actorId || "system",
        actorEmail || null,
        action,
        targetId || null,
        targetType || null,
        meta ? JSON.stringify(meta) : null,
        ip || null
      ]
    );
  } catch (err) {
    // Audit log failure should never break the main action
    console.error("[audit] Failed to write audit log:", err.message);
  }
}

export async function listAuditLog({ limit = 100, offset = 0, actorId, action } = {}) {
  const conditions = [];
  const params = [];
  if (actorId) { conditions.push("actor_id = ?"); params.push(actorId); }
  if (action)   { conditions.push("action = ?");   params.push(action); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit, offset);
  return all(
    `select * from audit_log ${where} order by created_at desc limit ? offset ?`,
    params
  );
}
