import { all, get, run } from "../db.js";
import { randomUUID } from "node:crypto";

export async function listCountries(activeOnly = false) {
  const sql = activeOnly
    ? "select * from admin_countries where is_active = 1 order by name asc"
    : "select * from admin_countries order by name asc";
  return all(sql, []);
}

export async function getCountryByCode(code) {
  return get("select * from admin_countries where code = ?", [code]);
}

export async function createCountry({ code, name, fiatCode, isActive = 1 }) {
  const id = randomUUID();
  await run(
    `insert into admin_countries (id, code, name, fiat_code, is_active)
     values (?,?,?,?,?)`,
    [id, code, name, fiatCode, isActive ? 1 : 0]
  );
  return get("select * from admin_countries where id = ?", [id]);
}

export async function updateCountry(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return get("select * from admin_countries where id = ?", [id]);
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  await run(`update admin_countries set ${setClause} where id = ?`, [...keys.map((k) => fields[k]), id]);
  return get("select * from admin_countries where id = ?", [id]);
}
