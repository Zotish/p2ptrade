import { all, get, run } from "../db.js";
import { randomUUID } from "node:crypto";

function deserialize(row) {
  if (!row) return row;
  return {
    ...row,
    details: row.details ? safeJson(row.details) : null
  };
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeDetails(details) {
  if (!details) return null;
  if (typeof details === "string") return details;
  return JSON.stringify(details);
}

export async function listPaymentProviders() {
  const rows = await all(
    "select * from admin_payment_providers order by created_at desc",
    []
  );
  return rows.map(deserialize);
}

export async function listActivePaymentProviders() {
  const rows = await all(
    "select * from admin_payment_providers where is_active = 1 order by created_at desc",
    []
  );
  return rows.map(deserialize);
}

export async function createPaymentProvider({ countryCode, method, name, details, isActive = 1 }) {
  const id = randomUUID();
  await run(
    `insert into admin_payment_providers
      (id, country_code, method, name, details, is_active)
     values (?,?,?,?,?,?)`,
    [
      id,
      String(countryCode).toUpperCase(),
      method,
      name,
      normalizeDetails(details),
      isActive ? 1 : 0
    ]
  );
  return getPaymentProviderById(id);
}

export async function updatePaymentProvider(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return getPaymentProviderById(id);
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => fields[k]);
  await run(`update admin_payment_providers set ${setClause} where id = ?`, [...values, id]);
  return getPaymentProviderById(id);
}

export async function deletePaymentProvider(id) {
  await run("delete from admin_payment_providers where id = ?", [id]);
  return { ok: true };
}

export async function getPaymentProviderById(id) {
  return deserialize(await get("select * from admin_payment_providers where id = ?", [id]));
}
