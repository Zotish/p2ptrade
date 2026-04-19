import { Router } from "express";
import { requireAuth } from "../auth.js";
import {
  getNotifications,
  getUnreadCount,
  markAllRead,
  markOneRead
} from "../repositories/notifications.js";

export const notificationsRouter = Router();

// সব notifications + unread count
notificationsRouter.get("/", requireAuth, async (req, res) => {
  try {
    const [notifications, unread] = await Promise.all([
      getNotifications(req.user.id, 30),
      getUnreadCount(req.user.id)
    ]);
    res.json({ notifications, unread });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// সব read করো
notificationsRouter.patch("/read-all", requireAuth, async (req, res) => {
  try {
    await markAllRead(req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// একটা read করো
notificationsRouter.patch("/:id/read", requireAuth, async (req, res) => {
  try {
    await markOneRead(req.params.id, req.user.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
