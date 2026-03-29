import { all, get, run } from "../db.js";
import { randomUUID } from "node:crypto";

export async function listAnnouncements() {
  return all("select * from admin_announcements order by created_at desc", []);
}

export async function listActiveAnnouncements() {
  return all(
    `select * from admin_announcements
     where is_active = 1
       and (starts_at is null or starts_at::timestamptz <= CURRENT_TIMESTAMP)
       and (ends_at is null or ends_at::timestamptz >= CURRENT_TIMESTAMP)
     order by created_at desc`,
    []
  );
}

export async function createAnnouncement({ message, startsAt, endsAt, isActive = 1 }) {
  const id = randomUUID();
  await run(
    `insert into admin_announcements (id, message, starts_at, ends_at, is_active)
     values (?,?,?,?,?)`,
    [id, message, startsAt || null, endsAt || null, isActive ? 1 : 0]
  );
  return getAnnouncementById(id);
}

export async function updateAnnouncement(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return getAnnouncementById(id);
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => fields[k]);
  await run(`update admin_announcements set ${setClause} where id = ?`, [...values, id]);
  return getAnnouncementById(id);
}

export async function deleteAnnouncement(id) {
  await run("delete from admin_announcements where id = ?", [id]);
  return { ok: true };
}

export async function getAnnouncementById(id) {
  return get("select * from admin_announcements where id = ?", [id]);
}
