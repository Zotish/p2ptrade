import { all, run } from "../db.js";
import { randomUUID } from "node:crypto";

export async function listMessages(orderId) {
  return all(
    `select * from order_messages where order_id = ? order by created_at asc`,
    [orderId]
  );
}

export async function createMessage({ orderId, senderId, message }) {
  const id = randomUUID();
  await run(
    `insert into order_messages (id, order_id, sender_id, message)
     values (?,?,?,?)`,
    [id, orderId, senderId, message]
  );
  return { id, order_id: orderId, sender_id: senderId, message };
}
