import { all, get, run } from "../db.js";
import { randomUUID } from "node:crypto";

export async function createWithdrawal({
  userId,
  chain,
  asset,
  toAddress,
  amount,
  fee,
  status,
  txid,
  approvedBy,
  approvedAt,
  rejectedReason
}) {
  const id = randomUUID();
  await run(
    `insert into withdrawals
      (id, user_id, chain, asset, to_address, amount, fee, status, txid, approved_by, approved_at, rejected_reason)
     values (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      userId,
      chain,
      asset,
      toAddress,
      amount,
      fee,
      status,
      txid || null,
      approvedBy || null,
      approvedAt || null,
      rejectedReason || null
    ]
  );
  return get("select * from withdrawals where id = ?", [id]);
}

export async function getWithdrawalById(id) {
  return get("select * from withdrawals where id = ?", [id]);
}

export async function listPendingWithdrawals() {
  return all(
    `select w.*, u.email as user_email
     from withdrawals w
     join users u on u.id = w.user_id
     where w.status = 'pending_approval'
     order by w.created_at asc`,
    []
  );
}

export async function updateWithdrawal(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return get("select * from withdrawals where id = ?", [id]);
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => fields[k]);
  await run(`update withdrawals set ${setClause} where id = ?`, [...values, id]);
  return get("select * from withdrawals where id = ?", [id]);
}
