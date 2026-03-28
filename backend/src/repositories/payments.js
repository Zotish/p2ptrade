import { get, run } from "../db.js";
import { randomUUID } from "node:crypto";

export async function createPayment({ orderId, method, reference, note, status }) {
  const id = randomUUID();
  await run(
    `insert into payments (id, order_id, method, status, reference, note)
     values (?,?,?,?,?,?)`,
    [id, orderId, method, status || "pending", reference || null, note || null]
  );
  return getPaymentById(id);
}

export async function updatePaymentStatus(id, status) {
  await run("update payments set status = ? where id = ?", [status, id]);
  return getPaymentById(id);
}

export async function getPaymentByOrder(orderId) {
  return get("select * from payments where order_id = ?", [orderId]);
}

export async function getPaymentById(id) {
  return get("select * from payments where id = ?", [id]);
}
