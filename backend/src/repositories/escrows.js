import { get, run } from "../db.js";
import { randomUUID } from "node:crypto";

export async function createEscrow({ offerId, sellerUserId, buyerUserId, token, amountToken }) {
  const id = randomUUID();
  await run(
    `insert into escrows
      (id, offer_id, seller_user_id, buyer_user_id, token, amount_token)
     values (?,?,?,?,?,?)`,
    [id, offerId, sellerUserId || null, buyerUserId || null, token, amountToken]
  );
  return getEscrowById(id);
}

export async function updateEscrowStatus(id, status) {
  await run("update escrows set status = ?, updated_at = CURRENT_TIMESTAMP where id = ?", [status, id]);
  return getEscrowById(id);
}

export async function getEscrowById(id) {
  return get("select * from escrows where id = ?", [id]);
}
