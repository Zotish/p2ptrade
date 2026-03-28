import { all, get, run } from "../db.js";
import { randomUUID } from "node:crypto";

export async function listConversations(userId) {
  return all(
    `select c.id as id, c.created_at as created_at
     from conversations c
     join conversation_participants p on p.conversation_id = c.id
     where p.user_id = ?
     order by c.created_at desc`,
    [userId]
  );
}

export async function listParticipants(conversationId) {
  return all(
    `select user_id from conversation_participants where conversation_id = ?`,
    [conversationId]
  );
}

export async function listConversationMessages(conversationId) {
  return all(
    `select * from conversation_messages where conversation_id = ? order by created_at asc`,
    [conversationId]
  );
}

export async function findConversationBetween(userIdA, userIdB) {
  return get(
    `select c.id as id
     from conversations c
     join conversation_participants p1 on p1.conversation_id = c.id and p1.user_id = ?
     join conversation_participants p2 on p2.conversation_id = c.id and p2.user_id = ?
     limit 1`,
    [userIdA, userIdB]
  );
}

export async function createConversation(participantIds) {
  const id = randomUUID();
  await run("insert into conversations (id) values (?)", [id]);
  for (const userId of participantIds) {
    await run(
      "insert into conversation_participants (conversation_id, user_id) values (?, ?)",
      [id, userId]
    );
  }
  return get("select * from conversations where id = ?", [id]);
}

export async function addConversationMessage({ conversationId, senderId, message }) {
  const id = randomUUID();
  await run(
    `insert into conversation_messages (id, conversation_id, sender_id, message)
     values (?,?,?,?)`,
    [id, conversationId, senderId, message]
  );
  return get("select * from conversation_messages where id = ?", [id]);
}
