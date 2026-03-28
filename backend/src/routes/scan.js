import { Router } from "express";
import { requireAuth } from "../auth.js";
import { scanRecentForUser } from "../services/scanRecent.js";

export const scanRouter = Router();

scanRouter.post("/recent", requireAuth, async (req, res) => {
  const { blocks } = req.body || {};
  const lookback = Number(blocks || 2000);
  const result = await scanRecentForUser(req.user.id, lookback);
  res.json(result);
});
