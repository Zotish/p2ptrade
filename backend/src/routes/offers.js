import { Router } from "express";
import { getMarketPrice, getFxRates } from "../services/pricing.js";
import { createOffer, listOffers, listOffersByMaker, getOfferById, updateOfferStatus, updateOffer } from "../repositories/offers.js";
import { requireAuth } from "../auth.js";
import { get as dbGet } from "../db.js";

async function getSellerStats(sellerUserId) {
  const [orderRow, ratingRow] = await Promise.all([
    dbGet(
      `select
        count(*) as total,
        sum(case when o.status = 'released' then 1 else 0 end) as completed,
        sum(case when o.status in ('payment_rejected','disputed') then 1 else 0 end) as rejected,
        sum(case when o.status = 'disputed' then 1 else 0 end) as disputed
       from orders o
       join offers of on of.id = o.offer_id
       where of.maker_user_id = ?`,
      [sellerUserId]
    ),
    dbGet(
      `select count(*) as total_ratings, avg(stars) as avg_stars
       from ratings
       where rated_user_id = ?`,
      [sellerUserId]
    )
  ]);

  const total        = Number(orderRow?.total || 0);
  const completed    = Number(orderRow?.completed || 0);
  const rejected     = Number(orderRow?.rejected || 0);
  const disputed     = Number(orderRow?.disputed || 0);
  const rate         = total > 0 ? Math.round((completed / total) * 100) : 100;
  const totalRatings = Number(ratingRow?.total_ratings || 0);
  const avgStars     = ratingRow?.avg_stars ? Number(Number(ratingRow.avg_stars).toFixed(1)) : null;

  // Use real average if ratings exist; otherwise fall back to rejection-based score
  const stars = avgStars !== null
    ? avgStars
    : Number(Math.max(1, Math.min(5, 5 - rejected * 0.5)).toFixed(1));

  return { total, completed, rejected, disputed, completionRate: rate, stars, totalRatings };
}

async function enrichOffersWithStats(offers) {
  return Promise.all(offers.map(async (offer) => {
    const [stats, sellerRow] = await Promise.all([
      getSellerStats(offer.maker_user_id),
      dbGet(
        "select handle, profile_name, profile_image_url from users where id = ?",
        [offer.maker_user_id]
      )
    ]);
    return {
      ...offer,
      sellerStats: stats,
      sellerProfile: {
        handle: sellerRow?.handle || null,
        profileName: sellerRow?.profile_name || null,
        profileImageUrl: sellerRow?.profile_image_url || null
      }
    };
  }));
}

export const offersRouter = Router();

offersRouter.get("/", async (req, res) => {
  const { country, token, fiat, paymentMethod } = req.query;
  try {
    const price = await getMarketPrice(token || "USDT");
    const offers = await listOffers({ country, token, fiat, paymentMethod });
    const fx = await getFxRates();
    const rate = fiat && fiat !== "USD" ? fx[fiat] : 1;
    res.set("Cache-Control", "no-store");
    res.json({ price, offers: await enrichOffersWithStats(offers), fxRate: rate || null });
  } catch (error) {
    res.set("Cache-Control", "no-store");
    res.status(502).json({ error: error.message });
  }
});

// Seller pauses/activates their offer
offersRouter.patch("/:id/status", requireAuth, async (req, res) => {
  const { status } = req.body || {};
  if (!["active", "paused"].includes(status)) {
    return res.status(400).json({ error: "Status must be 'active' or 'paused'" });
  }
  try {
    const offer = await updateOfferStatus(req.params.id, status, req.user.id);
    if (!offer) return res.status(404).json({ error: "Offer not found" });
    res.json({ offer });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Seller deletes (soft) their offer
offersRouter.delete("/:id", requireAuth, async (req, res) => {
  try {
    const offer = await updateOfferStatus(req.params.id, "deleted", req.user.id);
    if (!offer) return res.status(404).json({ error: "Offer not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Seller edits their offer
offersRouter.patch("/:id", requireAuth, async (req, res) => {
  const { minAmount, maxAmount, premiumPercent, paymentMethods, paymentDetails } = req.body || {};
  if (minAmount == null || maxAmount == null) {
    return res.status(400).json({ error: "minAmount and maxAmount required" });
  }
  try {
    let price, fx;
    // get the existing offer for token/fiat
    const existing = await getOfferById(req.params.id);
    if (!existing) return res.status(404).json({ error: "Offer not found" });
    if (existing.maker_user_id !== req.user.id) return res.status(403).json({ error: "Not your offer" });

    price = await getMarketPrice(existing.token);
    fx = await getFxRates();
    const rate = fx[existing.fiat];
    if (!rate) return res.status(400).json({ error: `FX rate not available for ${existing.fiat}` });

    const premium = Number(premiumPercent ?? existing.premium_percent ?? 0);
    const priceUsd = Number(price.usd);
    const priceFiat = Number((priceUsd * rate * (1 + premium / 100)).toFixed(4));

    const details = typeof paymentDetails === "object" && paymentDetails
      ? normalizePaymentDetails(paymentDetails)
      : existing.payment_details;

    const updated = await updateOffer(req.params.id, {
      minAmount: Number(minAmount),
      maxAmount: Number(maxAmount),
      premiumPercent: premium,
      priceUsd,
      priceFiat,
      paymentMethods: Array.isArray(paymentMethods) ? paymentMethods : existing.payment_methods,
      paymentDetails: details
    }, req.user.id);
    res.json({ offer: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

offersRouter.get("/mine", requireAuth, async (req, res) => {
  try {
    const { country, token, fiat } = req.query;
    const offers = await listOffersByMaker({
      makerUserId: req.user.id,
      country,
      token,
      fiat
    });
    res.json({ offers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

offersRouter.get("/:id", requireAuth, async (req, res) => {
  try {
    const offer = await getOfferById(req.params.id);
    if (!offer) return res.status(404).json({ error: "Offer not found" });
    res.json({ offer });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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
