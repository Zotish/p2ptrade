import { Router } from "express";
import { getMarketPrice, getFxRates } from "../services/pricing.js";
import { createOffer, listOffers, listOffersByMaker, getOfferById } from "../repositories/offers.js";
import { requireAuth } from "../auth.js";
import { get as dbGet } from "../db.js";

function getSellerStats(sellerUserId) {
  const row = dbGet(
    `select
      count(*) as total,
      sum(case when o.status = 'released' then 1 else 0 end) as completed,
      sum(case when o.status in ('payment_rejected','disputed') then 1 else 0 end) as rejected,
      sum(case when o.status = 'disputed' then 1 else 0 end) as disputed
     from orders o
     join offers of on of.id = o.offer_id
     where of.maker_user_id = ?`,
    [sellerUserId]
  );
  const total     = Number(row?.total || 0);
  const completed = Number(row?.completed || 0);
  const rejected  = Number(row?.rejected || 0);
  const disputed  = Number(row?.disputed || 0);
  const rate      = total > 0 ? Math.round((completed / total) * 100) : 100;
  // 5-star rating: starts at 5, -0.5 per rejection, min 1
  const stars = Math.max(1, Math.min(5, 5 - (rejected * 0.5))).toFixed(1);
  return { total, completed, rejected, disputed, completionRate: rate, stars: Number(stars) };
}

function enrichOffersWithStats(offers) {
  return offers.map((offer) => ({
    ...offer,
    sellerStats: getSellerStats(offer.maker_user_id)
  }));
}

export const offersRouter = Router();

offersRouter.get("/", async (req, res) => {
  const { country, token, fiat } = req.query;
  try {
    const price = await getMarketPrice(token || "USDT");
    const offers = await listOffers({ country, token, fiat });
    const fx = await getFxRates();
    const rate = fiat && fiat !== "USD" ? fx[fiat] : 1;
    res.set("Cache-Control", "no-store");
    res.json({ price, offers: enrichOffersWithStats(offers), fxRate: rate || null });
  } catch (error) {
    res.set("Cache-Control", "no-store");
    res.status(502).json({ error: error.message });
  }
});

offersRouter.get("/mine", requireAuth, async (req, res) => {
  const { country, token, fiat } = req.query;
  const offers = await listOffersByMaker({
    makerUserId: req.user.id,
    country,
    token,
    fiat
  });
  res.json({ offers });
});

offersRouter.get("/:id", requireAuth, async (req, res) => {
  const offer = await getOfferById(req.params.id);
  if (!offer) return res.status(404).json({ error: "Offer not found" });
  res.json({ offer });
});

offersRouter.post("/", requireAuth, async (req, res) => {
  const {
    country,
    token,
    fiat,
    minAmount,
    maxAmount,
    premiumPercent = 0,
    paymentMethods = [],
    paymentDetails
  } = req.body || {};

  if (!country || !token || !fiat || minAmount == null || maxAmount == null) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  const details = normalizePaymentDetails(paymentDetails || {});
  const missing = validatePaymentDetails(paymentMethods, details);
  if (missing.length) {
    return res.status(400).json({ error: `Missing payment details: ${missing.join(", ")}` });
  }

  let price;
  let fx;
  try {
    price = await getMarketPrice(token);
    fx = await getFxRates();
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
  const rate = fx[fiat];
  if (!rate) {
    return res.status(400).json({ error: `FX rate not available for ${fiat}` });
  }

  const priceUsd = Number(price.usd);
  const premium = Number(premiumPercent || 0);
  const priceFiat = Number((priceUsd * rate * (1 + premium / 100)).toFixed(4));

  const newOffer = await createOffer({
    makerUserId: req.user.id,
    country,
    token,
    fiat,
    minAmount: Number(minAmount),
    maxAmount: Number(maxAmount),
    premiumPercent: premium,
    priceUsd,
    priceFiat,
    paymentMethods,
    paymentDetails: details
  });

  res.status(201).json({ offer: newOffer });
});

function normalizePaymentDetails(raw) {
  const details = typeof raw === "object" && raw ? raw : {};
  return {
    bank_transfer: details.bank_transfer || null,
    mobile_money: details.mobile_money || null,
    card: details.card || null
  };
}

function validatePaymentDetails(methods, details) {
  const required = [];
  const list = Array.isArray(methods) ? methods : [];
  if (list.includes("bank_transfer")) {
    const d = details.bank_transfer || {};
    if (!d.bankName) required.push("bank_transfer.bankName");
    if (!d.accountName) required.push("bank_transfer.accountName");
    if (!d.accountNumber) required.push("bank_transfer.accountNumber");
  }
  if (list.includes("mobile_money")) {
    const d = details.mobile_money || {};
    if (!d.provider) required.push("mobile_money.provider");
    if (!d.accountName) required.push("mobile_money.accountName");
    if (!d.phone) required.push("mobile_money.phone");
  }
  if (list.includes("card")) {
    const d = details.card || {};
    if (!d.provider) required.push("card.provider");
    if (!d.accountName) required.push("card.accountName");
    if (!d.paymentLink) required.push("card.paymentLink");
  }
  return required;
}
