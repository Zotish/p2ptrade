import { Router } from "express";
import { reserveEscrow, releaseEscrow, refundEscrow } from "../services/escrow.js";
import { createOrder, getOrderById, updateOrderStatus } from "../repositories/orders.js";
import { listOrdersByBuyer, listOrdersBySeller } from "../repositories/ordersMine.js";
import { getOfferById } from "../repositories/offers.js";
import { config } from "../config.js";
import { requireAuth } from "../auth.js";
import { createPayment, getPaymentByOrder, updatePaymentStatus } from "../repositories/payments.js";
import { applyTradeFee } from "../services/tradeFees.js";
import { createMessage, listMessages } from "../repositories/messages.js";
import { emitToUser } from "../socket.js";
import { logAudit } from "../repositories/auditLog.js";
import { orderCreateLimiter, orderActionLimiter } from "../middleware/rateLimiter.js";
import { createRating, getRatingByOrder } from "../repositories/ratings.js";

export const ordersRouter = Router();

// ── Create order ──────────────────────────────────────────────────
ordersRouter.post("/", requireAuth, orderCreateLimiter, async (req, res) => {
  const { offerId, amountFiat } = req.body || {};
  if (!offerId || amountFiat == null) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  // Validation: must be positive number
  const parsedFiat = Number(amountFiat);
  if (!Number.isFinite(parsedFiat) || parsedFiat <= 0) {
    return res.status(400).json({ error: "amountFiat must be a positive number" });
  }

  const offer = await getOfferById(offerId);
  if (!offer) return res.status(404).json({ error: "Offer not found" });
  if (offer.status !== "active") return res.status(400).json({ error: "Offer is not active" });
  if (offer.maker_user_id === req.user.id) {
    return res.status(400).json({ error: "You cannot order your own offer" });
  }
  if (parsedFiat < offer.min_amount || parsedFiat > offer.max_amount) {
    return res.status(400).json({
      error: `Amount must be between ${offer.min_amount} and ${offer.max_amount} ${offer.fiat}`
    });
  }

  const amountToken = Number((parsedFiat / Number(offer.price_fiat)).toFixed(8));
  const expiresAt = new Date(Date.now() + config.escrowTimeoutMinutes * 60 * 1000);

  try {
    const escrow = await reserveEscrow({
      offerId,
      buyerUserId: req.user.id,
      sellerUserId: offer.maker_user_id,
      token: offer.token,
      amountToken
    });

    const order = await createOrder({
      offerId,
      buyerUserId: req.user.id,
      escrowId: escrow.id,
      amountFiat: parsedFiat,
      amountToken,
      expiresAt
    });

    res.status(201).json({ order });
  } catch (error) {
    res.status(400).json({ error: error.message || "Unable to reserve escrow" });
  }
});

ordersRouter.get("/mine", requireAuth, async (req, res) => {
  try {
    const { fiat } = req.query;
    const orders = await listOrdersByBuyer(req.user.id, fiat);
    res.json({ orders });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

ordersRouter.get("/selling", requireAuth, async (req, res) => {
  try {
    const { fiat } = req.query;
    const orders = await listOrdersBySeller(req.user.id, fiat);
    res.json({ orders });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

ordersRouter.get("/:id", requireAuth, async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const offer = await getOfferById(order.offer_id);
    if (!offer) return res.status(404).json({ error: "Offer not found" });
    if (order.buyer_user_id !== req.user.id && offer.maker_user_id !== req.user.id) {
      return res.status(403).json({ error: "Not authorized" });
    }
    const payment = await getPaymentByOrder(order.id);
    res.json({ order, offer, payment });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

ordersRouter.get("/:id/messages", requireAuth, async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const offer = await getOfferById(order.offer_id);
    if (!offer) return res.status(404).json({ error: "Offer not found" });
    if (order.buyer_user_id !== req.user.id && offer.maker_user_id !== req.user.id) {
      return res.status(403).json({ error: "Not authorized" });
    }
    const messages = await listMessages(order.id);
    res.json({ messages });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

ordersRouter.post("/:id/messages", requireAuth, orderActionLimiter, async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: "Message required" });
    }
    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const offer = await getOfferById(order.offer_id);
    if (!offer) return res.status(404).json({ error: "Offer not found" });
    if (order.buyer_user_id !== req.user.id && offer.maker_user_id !== req.user.id) {
      return res.status(403).json({ error: "Not authorized" });
    }
    const msg = await createMessage({
      orderId: order.id,
      senderId: req.user.id,
      message: String(message).trim().slice(0, 500)
    });
    res.status(201).json({ message: msg });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Seller confirms payment received (legacy route) ────────────────
ordersRouter.post("/:id/confirm-payment", requireAuth, orderActionLimiter, async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    const offer = await getOfferById(order.offer_id);
    if (!offer) return res.status(404).json({ error: "Offer not found" });
    if (offer.maker_user_id !== req.user.id) {
      return res.status(403).json({ error: "Not offer seller" });
    }
    const updated = await updateOrderStatus(order.id, "payment_confirmed");
    res.json({ order: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Buyer submits payment proof ────────────────────────────────────
ordersRouter.post("/:id/pay", requireAuth, orderActionLimiter, async (req, res) => {
  try {
    const { method, reference, note } = req.body || {};
    if (!method) return res.status(400).json({ error: "Missing payment method" });

    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.buyer_user_id !== req.user.id) {
      return res.status(403).json({ error: "Not order buyer" });
    }
    if (!["awaiting_payment", "payment_confirmed"].includes(order.status)) {
      return res.status(400).json({ error: `Cannot submit payment for order in '${order.status}' status` });
    }

    const existing = await getPaymentByOrder(order.id);
    if (existing) {
      return res.status(409).json({ error: "Payment already submitted" });
    }

    const payment = await createPayment({
      orderId: order.id,
      method,
      reference: String(reference || "").slice(0, 200),
      note: String(note || "").slice(0, 500),
      status: "submitted"
    });
    const updated = await updateOrderStatus(order.id, "payment_submitted");

    const offer = await getOfferById(order.offer_id);
    if (offer) {
      emitToUser(offer.maker_user_id, "order:payment_submitted", {
        orderId: order.id,
        amountFiat: order.amount_fiat,
        amountToken: order.amount_token,
        token: offer.token,
        fiat: offer.fiat
      });
    }

    res.json({ order: updated, payment });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Seller confirms & releases escrow ─────────────────────────────
ordersRouter.post("/:id/confirm", requireAuth, orderActionLimiter, async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.status === "released") {
      return res.status(400).json({ error: "Order already released" });
    }
    if (order.status !== "payment_submitted" && order.status !== "payment_confirmed") {
      return res.status(400).json({ error: `Cannot confirm order in '${order.status}' status` });
    }

    const offer = await getOfferById(order.offer_id);
    if (!offer) return res.status(404).json({ error: "Offer not found" });
    if (offer.maker_user_id !== req.user.id) {
      return res.status(403).json({ error: "Not offer seller" });
    }

    const payment = await getPaymentByOrder(order.id);
    if (!payment) return res.status(400).json({ error: "No payment submitted" });

    await updatePaymentStatus(payment.id, "confirmed");
    await applyTradeFee(order, offer);
    const escrow = await releaseEscrow(order.escrow_id);
    const updated = await updateOrderStatus(order.id, "released");

    emitToUser(order.buyer_user_id, "order:released", {
      orderId: order.id,
      amountToken: order.amount_token,
      token: offer.token
    });

    res.json({ order: updated, escrow });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Seller rejects payment ────────────────────────────────────────
ordersRouter.post("/:id/reject", requireAuth, orderActionLimiter, async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const offer = await getOfferById(order.offer_id);
    if (!offer) return res.status(404).json({ error: "Offer not found" });
    if (offer.maker_user_id !== req.user.id) {
      return res.status(403).json({ error: "Not offer seller" });
    }
    if (order.status !== "payment_submitted") {
      return res.status(400).json({ error: "Order is not in payment_submitted state" });
    }

    const payment = await getPaymentByOrder(order.id);
    if (!payment) return res.status(400).json({ error: "No payment submitted" });

    await updatePaymentStatus(payment.id, "rejected");
    const updated = await updateOrderStatus(order.id, "payment_rejected", {
      rejected_at: new Date().toISOString()
    });

    emitToUser(order.buyer_user_id, "order:payment_rejected", {
      orderId: order.id,
      token: offer.token,
      amountToken: order.amount_token,
      amountFiat: order.amount_fiat,
      fiat: offer.fiat
    });

    res.json({ order: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Buyer raises a dispute ────────────────────────────────────────
ordersRouter.post("/:id/dispute", requireAuth, orderActionLimiter, async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.buyer_user_id !== req.user.id) {
      return res.status(403).json({ error: "Only buyer can raise a dispute" });
    }
    if (order.status !== "payment_rejected") {
      return res.status(400).json({ error: "Can only dispute a rejected payment" });
    }

    const { reason } = req.body || {};
    const trimmedReason = String(reason || "").trim().slice(0, 1000);
    const updated = await updateOrderStatus(order.id, "disputed", {
      dispute_reason: trimmedReason || null
    });

    const offer = await getOfferById(order.offer_id);
    if (offer) {
      emitToUser(offer.maker_user_id, "order:disputed", {
        orderId: order.id,
        reason: trimmedReason || "No reason provided"
      });
      emitToUser("admin", "order:disputed", {
        orderId: order.id,
        buyerId: order.buyer_user_id,
        sellerId: offer.maker_user_id,
        amountToken: order.amount_token,
        token: offer.token,
        reason: trimmedReason || "No reason provided"
      });
    }

    res.json({ order: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Buyer cancels after rejection ─────────────────────────────────
ordersRouter.post("/:id/cancel", requireAuth, orderActionLimiter, async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.buyer_user_id !== req.user.id) {
      return res.status(403).json({ error: "Only buyer can cancel" });
    }
    if (order.status !== "payment_rejected") {
      return res.status(400).json({ error: "Can only cancel a rejected order" });
    }

    await refundEscrow(order.escrow_id);
    const updated = await updateOrderStatus(order.id, "cancelled");

    const offer = await getOfferById(order.offer_id);
    if (offer) emitToUser(offer.maker_user_id, "order:cancelled", { orderId: order.id });

    res.json({ order: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Seller manually releases escrow ──────────────────────────────
ordersRouter.post("/:id/release", requireAuth, orderActionLimiter, async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.status === "released") {
      return res.status(400).json({ error: "Order already released" });
    }
    const offer = await getOfferById(order.offer_id);
    if (!offer) return res.status(404).json({ error: "Offer not found" });
    if (offer.maker_user_id !== req.user.id) {
      return res.status(403).json({ error: "Not offer seller" });
    }

    await applyTradeFee(order, offer);
    const escrow = await releaseEscrow(order.escrow_id);
    const updated = await updateOrderStatus(order.id, "released");

    emitToUser(order.buyer_user_id, "order:released", {
      orderId: order.id,
      amountToken: order.amount_token,
      token: offer.token
    });

    res.json({ order: updated, escrow });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Buyer rates the seller after order released ───────────────────
ordersRouter.post("/:id/rate", requireAuth, orderActionLimiter, async (req, res) => {
  try {
    const { stars, comment } = req.body || {};
    const parsedStars = Number(stars);
    if (!Number.isInteger(parsedStars) || parsedStars < 1 || parsedStars > 5) {
      return res.status(400).json({ error: "Stars must be an integer between 1 and 5" });
    }

    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.buyer_user_id !== req.user.id) {
      return res.status(403).json({ error: "Only the buyer can rate this order" });
    }
    if (order.status !== "released") {
      return res.status(400).json({ error: "Order must be released before rating" });
    }

    const existing = await getRatingByOrder(order.id);
    if (existing) {
      return res.status(409).json({ error: "You already rated this order" });
    }

    const offer = await getOfferById(order.offer_id);
    if (!offer) return res.status(404).json({ error: "Offer not found" });

    const rating = await createRating({
      orderId: order.id,
      raterUserId: req.user.id,
      ratedUserId: offer.maker_user_id,
      stars: parsedStars,
      comment: comment ? String(comment).slice(0, 300) : null
    });

    res.status(201).json({ rating });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Seller refunds escrow ─────────────────────────────────────────
ordersRouter.post("/:id/refund", requireAuth, orderActionLimiter, async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (["released", "refunded"].includes(order.status)) {
      return res.status(400).json({ error: `Order already ${order.status}` });
    }
    const offer = await getOfferById(order.offer_id);
    if (!offer) return res.status(404).json({ error: "Offer not found" });
    if (offer.maker_user_id !== req.user.id) {
      return res.status(403).json({ error: "Not offer seller" });
    }

    const escrow = await refundEscrow(order.escrow_id);
    const updated = await updateOrderStatus(order.id, "refunded");

    emitToUser(order.buyer_user_id, "order:refunded", { orderId: order.id });

    res.json({ order: updated, escrow });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
