import { all, get, run } from "../db.js";
import { randomUUID } from "node:crypto";

export async function listFiats(activeOnly = false) {
  const sql = activeOnly
    ? "select * from admin_fiats where is_active = 1 order by code asc"
    : "select * from admin_fiats order by code asc";
  return all(sql, []);
}

export async function getFiatByCode(code) {
  return get("select * from admin_fiats where code = ?", [code]);
}

export async function createFiat({ code, name, symbol, isActive = 1 }) {
  const id = randomUUID();
  await run(
    `insert into admin_fiats (id, code, name, symbol, is_active)
     values (?,?,?,?,?)`,
    [id, code, name, symbol || null, isActive ? 1 : 0]
  );
  return get("select * from admin_fiats where id = ?", [id]);
}

export async function updateFiat(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return get("select * from admin_fiats where id = ?", [id]);
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  await run(`update admin_fiats set ${setClause} where id = ?`, [...keys.map((k) => fields[k]), id]);
  return get("select * from admin_fiats where id = ?", [id]);
}
