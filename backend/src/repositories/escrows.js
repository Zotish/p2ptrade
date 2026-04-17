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

/**
 * Atomic status update — already-released/refunded escrow-এ double-operation হবে না।
 * fromStatus দিলে only that status থেকেই transition হবে।
 */
export async function updateEscrowStatus(id, status, fromStatus = null) {
  if (fromStatus) {
    const result = await run(
      "update escrows set status = ?, updated_at = CURRENT_TIMESTAMP where id = ? and status = ?",
      [status, id, fromStatus]
    );
    if (result.rowCount === 0) {
      // Either already in target status or not in fromStatus
      return getEscrowById(id);
    }
  } else {
    await run("update escrows set status = ?, updated_at = CURRENT_TIMESTAMP where id = ?", [status, id]);
  }
  return getEscrowById(id);
}

export async function getEscrowById(id) {
  return get("select * from escrows where id = ?", [id]);
}
