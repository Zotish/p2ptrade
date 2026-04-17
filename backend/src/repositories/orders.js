import { all, get, run } from "../db.js";
import { randomUUID } from "node:crypto";

export async function createOrder({
  offerId,
  buyerUserId,
  escrowId,
  amountFiat,
  amountToken,
  expiresAt
}) {
  const id = randomUUID();

  await run(
    `insert into orders
      (id, offer_id, buyer_user_id, escrow_id, amount_fiat, amount_token, expires_at)
     values (?,?,?,?,?,?,?)`,
    [id, offerId, buyerUserId || null, escrowId, amountFiat, amountToken, expiresAt.toISOString()]
  );

  return getOrderById(id);
}

export async function updateOrderStatus(id, status, extra = {}) {
  // build SET clause; updated_at uses raw SQL so handle separately
  const setClauses = ["status = ?", "updated_at = CURRENT_TIMESTAMP"];
  const values = [status];
  for (const [k, v] of Object.entries(extra)) {
    setClauses.push(`${k} = ?`);
    values.push(v);
  }
  await run(`update orders set ${setClauses.join(", ")} where id = ?`, [...values, id]);
  return getOrderById(id);
}

export async function updateOrderFee(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return getOrderById(id);
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => fields[k]);
  // Atomic: only update if fee hasn't been applied yet (prevents double-fee on concurrent calls)
  await run(
    `update orders set ${setClause}, updated_at = CURRENT_TIMESTAMP where id = ? and fee_amount is null`,
    [...values, id]
  );
  return getOrderById(id);
}

export async function getOrderById(id) {
  return get("select * from orders where id = ?", [id]);
}

export async function findExpiredOrders() {
  return all(
    `select * from orders
     where status in ('awaiting_payment','payment_confirmed')
       and expires_at <= CURRENT_TIMESTAMP`
  );
}

// Appeal timer: payment_rejected orders where buyer didn't dispute within 24h
export async function findExpiredRejections() {
  return all(
    `select * from orders
     where status = 'payment_rejected'
       and rejected_at is not null
       and rejected_at <= (CURRENT_TIMESTAMP - INTERVAL '24 hours')`
  );
}
