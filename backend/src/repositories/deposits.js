import { all, get, run } from "../db.js";
import { randomUUID } from "node:crypto";

export async function getDepositByTx(chain, txid, addressId) {
  if (addressId) {
    return get(
      "select * from deposits where chain = ? and txid = ? and address_id = ?",
      [chain, txid, addressId]
    );
  }
  return get("select * from deposits where chain = ? and txid = ?", [chain, txid]);
}

export async function listDepositsByAddress(addressId) {
  return all("select * from deposits where address_id = ?", [addressId]);
}

export async function createDeposit({ addressId, chain, txid, amount, confirmations, status }) {
  const id = randomUUID();
  await run(
    `insert into deposits (id, address_id, chain, txid, amount, confirmations, status)
     values (?,?,?,?,?,?,?)`,
    [id, addressId, chain, txid, amount, confirmations || 0, status || "pending"]
  );
  return get("select * from deposits where id = ?", [id]);
}

export async function createDepositIfNew({ addressId, chain, txid, amount, confirmations, status }) {
  const id = randomUUID();
  const result = await run(
    `insert into deposits (id, address_id, chain, txid, amount, confirmations, status)
     values (?,?,?,?,?,?,?)
     on conflict (chain, txid, address_id) do nothing`,
    [id, addressId, chain, txid, amount, confirmations || 0, status || "pending"]
  );
  const deposit = await getDepositByTx(chain, txid, addressId);
  return { deposit, inserted: result.rowCount > 0 };
}

export async function updateDeposit(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return get("select * from deposits where id = ?", [id]);
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => fields[k]);
  await run(`update deposits set ${setClause} where id = ?`, [...values, id]);
  return get("select * from deposits where id = ?", [id]);
}
