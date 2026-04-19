import { randomUUID } from "crypto";
import { run, get, all } from "../db.js";

export async function createNotification({ userId, type, title, body, data = {} }) {
  const id = randomUUID();
  await run(
    `insert into notifications (id, user_id, type, title, body, data)
     values (?, ?, ?, ?, ?, ?)`,
    [id, userId, type, title, body, JSON.stringify(data)]
  );
  return { id, userId, type, title, body, data, is_read: 0 };
}

export async function getNotifications(userId, limit = 30) {
  const rows = await all(
    `select * from notifications where user_id = ?
     order by created_at desc limit ?`,
    [userId, limit]
  );
  return rows.map((r) => ({ ...r, data: JSON.parse(r.data || "{}") }));
}

export async function getUnreadCount(userId) {
  const row = await get(
    "select count(*) as cnt from notifications where user_id = ? and is_read = 0",
    [userId]
  );
  return Number(row?.cnt || 0);
}

export async function markAllRead(userId) {
  await run("update notifications set is_read = 1 where user_id = ?", [userId]);
}

export async function markOneRead(id, userId) {
  await run("update notifications set is_read = 1 where id = ? and user_id = ?", [id, userId]);
}
