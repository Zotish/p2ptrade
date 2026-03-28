import { Router } from "express";
import { getCryptoPrices, getFxRates } from "../services/pricing.js";
import { listActiveAssets } from "../repositories/admin.js";
import { listFiats } from "../repositories/fiats.js";

export const marketRouter = Router();

marketRouter.get("/", async (req, res) => {
  const fiat = String(req.query.fiat || "USD").toUpperCase();
  try {
    const assets = await listActiveAssets();
    const tokens = assets.map((a) => a.symbol);
    if (!tokens.length) return res.json({ fiat, pairs: [] });
    const fiats = await listFiats(true);
    if (fiat !== "USD" && !fiats.find((f) => f.code === fiat)) {
      return res.status(400).json({ error: `Fiat ${fiat} not supported` });
    }
    const prices = await getCryptoPrices(tokens);
    let fxRate = 1;
    if (fiat !== "USD") {
      const fx = await getFxRates();
      fxRate = fx[fiat];
      if (!fxRate) {
        return res.status(400).json({ error: `FX rate not available for ${fiat}` });
      }
    }
    const pairs = tokens.map((t) => {
      const usd = prices[t]?.usd || null;
      const priceFiat = usd ? Number((usd * fxRate).toFixed(6)) : null;
      return {
        token: t,
        base: fiat,
        price: priceFiat,
        source: prices[t]?.source || "-"
      };
    });
    res.json({ fiat, pairs });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});
