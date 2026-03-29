import { Router } from "express";
import { requireAuth } from "../auth.js";
import {
  addConversationMessage,
  createConversation,
  findConversationBetween,
  listConversationMessages,
  listConversations,
  listParticipants
} from "../repositories/conversations.js";
import { getUserById } from "../repositories/users.js";

export const chatRouter = Router();

chatRouter.use(requireAuth);

chatRouter.get("/conversations", async (req, res) => {
  try {
    const conversations = await listConversations(req.user.id);
    const enriched = [];
    for (const convo of conversations) {
      const participants = await listParticipants(convo.id);
      const otherIds = participants.map((p) => p.user_id).filter((id) => id !== req.user.id);
      let otherUser = null;
      if (otherIds.length) {
        const user = await getUserById(otherIds[0]);
        if (user) otherUser = { id: user.id, email: user.email, handle: user.handle };
      }
      enriched.push({ ...convo, otherUser });
    }
    res.json({ conversations: enriched });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

chatRouter.post("/conversations", async (req, res) => {
  const { recipientId } = req.body || {};
  if (!recipientId) return res.status(400).json({ error: "recipientId required" });
  if (recipientId === req.user.id) return res.status(400).json({ error: "Cannot chat with yourself" });
  const recipient = await getUserById(recipientId);
  if (!recipient) return res.status(404).json({ error: "User not found" });
  const existing = await findConversationBetween(req.user.id, recipientId);
  if (existing) {
    return res.status(200).json({ conversation: existing, existing: true });
  }
  const convo = await createConversation([req.user.id, recipientId]);
  res.status(201).json({ conversation: convo, existing: false });
});

chatRouter.get("/conversations/:id/messages", async (req, res) => {
  try {
    const participants = await listParticipants(req.params.id);
    if (!participants.some((p) => p.user_id === req.user.id)) {
      return res.status(403).json({ error: "Not authorized" });
    }
    const messages = await listConversationMessages(req.params.id);
    res.json({ messages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

chatRouter.post("/conversations/:id/messages", async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!message) return res.status(400).json({ error: "Message required" });
    const participants = await listParticipants(req.params.id);
    if (!participants.some((p) => p.user_id === req.user.id)) {
      return res.status(403).json({ error: "Not authorized" });
    }
    const msg = await addConversationMessage({
      conversationId: req.params.id,
      senderId: req.user.id,
      message: String(message).slice(0, 500)
    });
    res.status(201).json({ message: msg });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
