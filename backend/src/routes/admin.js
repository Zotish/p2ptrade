import { Router } from "express";
import { requireAdmin } from "../auth.js";
import { run, get, all as dbAllTop } from "../db.js";
import {
  createAsset,
  createChain,
  listActiveAssets,
  listAssets,
  listChains,
  listUsers,
  updateUserRole,
  updateAsset,
  updateChain
} from "../repositories/admin.js";
import { createFiat, listFiats, updateFiat } from "../repositories/fiats.js";
import { createCountry, listCountries, updateCountry, getCountryByCode } from "../repositories/countries.js";
import { listPendingWithdrawals } from "../repositories/withdrawals.js";
import { approveWithdrawal, rejectWithdrawal, adminTreasuryWithdraw } from "../services/withdrawService.js";
import { getTreasurySnapshot } from "../services/treasury.js";
import { detectChainFromRpc } from "../services/chainDetect.js";
import { listAnnouncements, listActiveAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement } from "../repositories/announcements.js";
import { getUserCounts, getTradeVolumeUsd } from "../repositories/metrics.js";
import {
  listPaymentProviders,
  listActivePaymentProviders,
  createPaymentProvider,
  updatePaymentProvider,
  deletePaymentProvider
} from "../repositories/paymentProviders.js";

export const adminRouter = Router();

adminRouter.get("/public-catalog", async (req, res) => {
  try {
    const [assets, fiats, countries, announcements, paymentProviders, users, volume] =
      await Promise.all([
        listActiveAssets(),
        listFiats(true),
        listCountries(true),
        listActiveAnnouncements(),
        listActivePaymentProviders(),
        getUserCounts(10),
        getTradeVolumeUsd()
      ]);
    res.json({
      assets,
      fiats,
      countries,
      announcements,
      paymentProviders,
      metrics: {
        liveUsers: users.live,
        totalUsers: users.total,
        totalVolumeUsd: volume.totalUsd,
        totalTrades: volume.trades
      }
    });
  } catch (err) {
    console.error("[public-catalog]", err.message);
    res.status(500).json({ error: "Failed to load catalog" });
  }
});

adminRouter.use(requireAdmin);

adminRouter.get("/catalog", async (req, res) => {
  try {
    const [chains, assets, users, pendingWithdrawals, fiats, countries, announcements, paymentProviders] = await Promise.all([
      listChains(),
      listAssets(),
      listUsers(),
      listPendingWithdrawals(),
      listFiats(false),
      listCountries(false),
      listAnnouncements(),
      listPaymentProviders()
    ]);
    res.json({ chains, assets, users, pendingWithdrawals, fiats, countries, announcements, paymentProviders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get("/health", async (req, res) => {
  try {
    const chains = await listChains();
    const statuses = await Promise.all(
      chains.map(async (chain) => ({
        code: chain.code,
        name: chain.name,
        kind: chain.kind,
        network: chain.network,
        endpoints: parseRpcUrls(chain),
        checks: await checkChainHealth(chain)
      }))
    );
    res.json({ statuses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.get("/treasury", async (req, res) => {
  try {
    const snapshot = await getTreasurySnapshot();
    res.json(snapshot);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

adminRouter.post("/announcements", async (req, res) => {
  const { message, startsAt, endsAt, isActive } = req.body || {};
  if (!message) return res.status(400).json({ error: "Message required" });
  try {
    const announcement = await createAnnouncement({ message, startsAt, endsAt, isActive });
    res.status(201).json({ announcement });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

adminRouter.patch("/announcements/:id", async (req, res) => {
  try {
    const fields = mapAnnouncementFields(req.body || {});
    const announcement = await updateAnnouncement(req.params.id, fields);
    res.json({ announcement });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

adminRouter.delete("/announcements/:id", async (req, res) => {
  try {
    await deleteAnnouncement(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

adminRouter.post("/payment-providers", async (req, res) => {
  const { countryCode, method, name, details, isActive } = req.body || {};
  if (!countryCode || !method || !name) {
    return res.status(400).json({ error: "countryCode, method, and name required" });
  }
  try {
    const provider = await createPaymentProvider({
      countryCode,
      method,
      name,
      details,
      isActive
    });
    res.status(201).json({ provider });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

adminRouter.patch("/payment-providers/:id", async (req, res) => {
  try {
    const fields = mapPaymentProviderFields(req.body || {});
    const provider = await updatePaymentProvider(req.params.id, fields);
    res.json({ provider });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

adminRouter.delete("/payment-providers/:id", async (req, res) => {
  try {
    await deletePaymentProvider(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

adminRouter.post("/treasury/withdraw", async (req, res) => {
  const { asset, amount, toAddress } = req.body || {};
  try {
    const result = await adminTreasuryWithdraw({
      adminUserId: req.user.id,
      asset: String(asset || "").toUpperCase(),
      amount: Number(amount),
      toAddress
    });
    res.json({ result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

adminRouter.post("/chains", async (req, res) => {
  const { code, name, kind, network, rpcUrl, isActive } = req.body || {};
  if (!code || !name) {
    return res.status(400).json({ error: "Code and name required" });
  }
  try {
    let resolvedKind = kind || "evm";
    let resolvedNetwork = network || "testnet";
    const rpcUrls = normalizeRpcUrls(req.body?.rpcUrls);
    if (resolvedKind === "auto") {
      const detected = await detectChainFromRpc(
        [rpcUrl, ...String(rpcUrls || "").split(",")].filter(Boolean)
      );
      resolvedKind = detected.kind;
      if (!network) resolvedNetwork = detected.network || resolvedNetwork;
    }
    const chain = await createChain({
      code: String(code).toUpperCase(),
      name,
      kind: resolvedKind || "evm",
      network: resolvedNetwork || "testnet",
      rpcUrl,
      rpcUrls,
      isActive
    });
    res.status(201).json({ chain });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

adminRouter.patch("/chains/:id", async (req, res) => {
  try {
    const body = req.body || {};
    if (body.kind === "auto") {
      const urls = normalizeRpcUrls(body.rpcUrls || body.rpcUrl || "");
      const detected = await detectChainFromRpc(String(urls || "").split(",").filter(Boolean));
      body.kind = detected.kind;
      if (!body.network) body.network = detected.network || body.network;
    }
    const chain = await updateChain(req.params.id, mapChainFields(body));
    res.json({ chain });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

adminRouter.post("/assets", async (req, res) => {
  const {
    symbol,
    name,
    chainCode,
    isNative,
    contractAddress,
    coingeckoId,
    decimals,
    isActive,
    depositsEnabled,
    withdrawalsEnabled,
    feeAddress,
    feeBps
  } = req.body || {};
  if (!symbol || !name || !chainCode) {
    return res.status(400).json({ error: "Symbol, name, and chainCode required" });
  }
  try {
    const asset = await createAsset({
      symbol: String(symbol).toUpperCase(),
      name,
      chainCode: String(chainCode).toUpperCase(),
      isNative,
      contractAddress,
      coingeckoId,
      decimals: Number(decimals || 18),
      isActive,
      depositsEnabled,
      withdrawalsEnabled,
      feeAddress,
      feeBps
    });
    res.status(201).json({ asset });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

adminRouter.post("/fiats", async (req, res) => {
  const { code, name, symbol, isActive, countryCode, countryName } = req.body || {};
  if (!code || !name) {
    return res.status(400).json({ error: "Code and name required" });
  }
  try {
    const fiat = await createFiat({
      code: String(code).toUpperCase(),
      name,
      symbol,
      isActive
    });
    if (countryCode && countryName) {
      const existing = await getCountryByCode(String(countryCode).toUpperCase());
      if (!existing) {
        await createCountry({
          code: String(countryCode).toUpperCase(),
          name: countryName,
          fiatCode: fiat.code,
          isActive: true
        });
      } else if (existing.fiat_code !== fiat.code) {
        await updateCountry(existing.id, { fiat_code: fiat.code, name: countryName });
      }
    }
    res.status(201).json({ fiat });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

adminRouter.patch("/fiats/:id", async (req, res) => {
  const body = req.body || {};
  const fields = {};
  if (body.code !== undefined) fields.code = String(body.code).toUpperCase();
  if (body.name !== undefined) fields.name = body.name;
  if (body.symbol !== undefined) fields.symbol = body.symbol || null;
  if (body.isActive !== undefined) fields.is_active = body.isActive ? 1 : 0;
  try {
    const fiat = await updateFiat(req.params.id, fields);
    res.json({ fiat });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

adminRouter.post("/countries", async (req, res) => {
  const { code, name, fiatCode, isActive } = req.body || {};
  if (!code || !name || !fiatCode) {
    return res.status(400).json({ error: "Code, name, and fiatCode required" });
  }
  try {
    const country = await createCountry({
      code: String(code).toUpperCase(),
      name,
      fiatCode: String(fiatCode).toUpperCase(),
      isActive
    });
    res.status(201).json({ country });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

adminRouter.patch("/countries/:id", async (req, res) => {
  const body = req.body || {};
  const fields = {};
  if (body.code !== undefined) fields.code = String(body.code).toUpperCase();
  if (body.name !== undefined) fields.name = body.name;
  if (body.fiatCode !== undefined) fields.fiat_code = String(body.fiatCode).toUpperCase();
  if (body.isActive !== undefined) fields.is_active = body.isActive ? 1 : 0;
  try {
    const country = await updateCountry(req.params.id, fields);
    res.json({ country });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

adminRouter.patch("/assets/:id", async (req, res) => {
  try {
    const asset = await updateAsset(req.params.id, mapAssetFields(req.body || {}));
    res.json({ asset });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Freeze / Unfreeze user account
adminRouter.post("/users/:id/freeze", requireAdmin, async (req, res) => {
  const { reason } = req.body || {};
  try {
    await run(
      "update users set is_frozen = 1, freeze_reason = ? where id = ?",
      [reason || "Suspended by admin", req.params.id]
    );
    const user = await get("select id, email, is_frozen, freeze_reason from users where id = ?", [req.params.id]);
    res.json({ user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

adminRouter.post("/users/:id/unfreeze", requireAdmin, async (req, res) => {
  try {
    await run("update users set is_frozen = 0, freeze_reason = null where id = ?", [req.params.id]);
    const user = await get("select id, email, is_frozen from users where id = ?", [req.params.id]);
    res.json({ user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

adminRouter.patch("/users/:id/role", async (req, res) => {
  const { role } = req.body || {};
  if (!role || !["user", "admin"].includes(role)) {
    return res.status(400).json({ error: "Role must be user or admin" });
  }
  try {
    const user = await updateUserRole(req.params.id, role);
    res.json({ user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

adminRouter.get("/withdrawals/pending", async (req, res) => {
  try {
    const withdrawals = await listPendingWithdrawals();
    res.json({ withdrawals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

adminRouter.post("/withdrawals/:id/approve", async (req, res) => {
  try {
    const withdrawal = await approveWithdrawal({
      withdrawalId: req.params.id,
      adminUserId: req.user.id
    });
    res.json({ withdrawal });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

adminRouter.post("/withdrawals/:id/reject", async (req, res) => {
  try {
    const withdrawal = await rejectWithdrawal({
      withdrawalId: req.params.id,
      adminUserId: req.user.id,
      reason: req.body?.reason
    });
    res.json({ withdrawal });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ── Dispute Management ────────────────────────────
import { getOrderById, updateOrderStatus } from "../repositories/orders.js";
import { getOfferById } from "../repositories/offers.js";
import { releaseEscrow, refundEscrow } from "../services/escrow.js";
import { applyTradeFee } from "../services/tradeFees.js";
import { emitToUser } from "../socket.js";
// db already imported at top

// GET /admin/disputes — all disputed orders
adminRouter.get("/disputes", requireAdmin, async (req, res) => {
  try {
    const disputes = await dbAllTop(
      `select o.*,
              of.token          as offer_token,
              of.fiat           as offer_fiat,
              of.maker_user_id  as seller_id,
              p.method          as pay_method,
              p.reference       as pay_reference,
              p.note            as pay_note,
              buyer.email       as buyer_email,
              buyer.profile_name as buyer_name,
              buyer.phone       as buyer_phone,
              seller.email      as seller_email,
              seller.profile_name as seller_name
       from orders o
       join offers of on of.id = o.offer_id
       left join payments p on p.order_id = o.id
       left join users buyer  on buyer.id  = o.buyer_user_id
       left join users seller on seller.id = of.maker_user_id
       where o.status = 'disputed'
       order by o.updated_at desc`,
      []
    );
    res.json({ disputes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /admin/disputes/:id/release — admin sides with buyer → crypto goes to buyer
adminRouter.post("/disputes/:id/release", requireAdmin, async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.status !== "disputed") return res.status(400).json({ error: "Order is not disputed" });

    const offer = await getOfferById(order.offer_id);
    await applyTradeFee(order, offer);
    await releaseEscrow(order.escrow_id);
    const updated = await updateOrderStatus(order.id, "released", {
      resolved_by: req.user.id,
      resolved_at: new Date().toISOString(),
      admin_note: req.body?.note || "Admin sided with buyer"
    });

    // Notify buyer
    emitToUser(order.buyer_user_id, "order:released", {
      orderId: order.id,
      amountToken: order.amount_token,
      token: offer.token,
      message: "Admin reviewed your dispute and released the crypto to you."
    });
    // Notify seller
    emitToUser(offer.maker_user_id, "order:dispute_resolved", {
      orderId: order.id,
      result: "buyer_won",
      message: "Admin reviewed the dispute and sided with the buyer."
    });

    res.json({ order: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /admin/disputes/:id/refund — admin sides with seller → crypto back to seller
adminRouter.post("/disputes/:id/refund", requireAdmin, async (req, res) => {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) return res.status(404).json({ error: "Order not found" });
    if (order.status !== "disputed") return res.status(400).json({ error: "Order is not disputed" });

    const offer = await getOfferById(order.offer_id);
    await refundEscrow(order.escrow_id);
    const updated = await updateOrderStatus(order.id, "refunded", {
      resolved_by: req.user.id,
      resolved_at: new Date().toISOString(),
      admin_note: req.body?.note || "Admin sided with seller"
    });

    // Notify buyer
    emitToUser(order.buyer_user_id, "order:dispute_resolved", {
      orderId: order.id,
      result: "seller_won",
      message: "Admin reviewed your dispute and sided with the seller. No crypto was released."
    });
    // Notify seller
    emitToUser(offer.maker_user_id, "order:refunded", {
      orderId: order.id,
      message: "Dispute resolved. Your crypto has been returned."
    });

    res.json({ order: updated });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

function mapChainFields(body) {
  const out = {};
  if (body.code !== undefined) out.code = String(body.code).toUpperCase();
  if (body.name !== undefined) out.name = body.name;
  if (body.kind !== undefined) out.kind = body.kind;
  if (body.network !== undefined) out.network = body.network;
  if (body.rpcUrl !== undefined) out.rpc_url = body.rpcUrl || null;
  if (body.rpcUrls !== undefined) out.rpc_urls = normalizeRpcUrls(body.rpcUrls);
  if (body.isActive !== undefined) out.is_active = body.isActive ? 1 : 0;
  return out;
}

function mapPaymentProviderFields(body) {
  const out = {};
  if (body.countryCode !== undefined) out.country_code = String(body.countryCode).toUpperCase();
  if (body.method !== undefined) out.method = body.method;
  if (body.name !== undefined) out.name = body.name;
  if (body.details !== undefined) out.details = typeof body.details === "string" ? body.details : JSON.stringify(body.details);
  if (body.isActive !== undefined) out.is_active = body.isActive ? 1 : 0;
  return out;
}

function mapAssetFields(body) {
  const out = {};
  if (body.symbol !== undefined) out.symbol = String(body.symbol).toUpperCase();
  if (body.name !== undefined) out.name = body.name;
  if (body.chainCode !== undefined) out.chain_code = String(body.chainCode).toUpperCase();
  if (body.isNative !== undefined) out.is_native = body.isNative ? 1 : 0;
  if (body.contractAddress !== undefined) out.contract_address = body.contractAddress || null;
  if (body.coingeckoId !== undefined) out.coingecko_id = body.coingeckoId || null;
  if (body.decimals !== undefined) out.decimals = Number(body.decimals);
  if (body.isActive !== undefined) out.is_active = body.isActive ? 1 : 0;
  if (body.depositsEnabled !== undefined) out.deposits_enabled = body.depositsEnabled ? 1 : 0;
  if (body.withdrawalsEnabled !== undefined) out.withdrawals_enabled = body.withdrawalsEnabled ? 1 : 0;
  if (body.feeAddress !== undefined) out.fee_address = body.feeAddress || null;
  if (body.feeBps !== undefined) out.fee_bps = Number(body.feeBps);
  return out;
}

function normalizeRpcUrls(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .join(",");
}

function mapAnnouncementFields(body) {
  const out = {};
  if (body.message !== undefined) out.message = body.message;
  if (body.startsAt !== undefined) out.starts_at = body.startsAt || null;
  if (body.endsAt !== undefined) out.ends_at = body.endsAt || null;
  if (body.isActive !== undefined) out.is_active = body.isActive ? 1 : 0;
  return out;
}

function parseRpcUrls(chain) {
  return String(chain.rpc_urls || chain.rpc_url || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function checkChainHealth(chain) {
  const urls = parseRpcUrls(chain);
  if (!urls.length) return [];
  return Promise.all(
    urls.map(async (url) => {
      try {
        const ok = await pingUrl(chain.kind, chain.code, url);
        return { url, ok: true, details: ok };
      } catch (error) {
        return { url, ok: false, details: error.message };
      }
    })
  );
}

async function pingUrl(kind, code, url) {
  if (kind === "evm") {
    const body = {
      jsonrpc: "2.0",
      method: "eth_chainId",
      params: [],
      id: 1
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const json = await res.json();
    return json.result || "ok";
  }
  if (kind === "solana") {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getHealth"
      })
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const json = await res.json();
    return json.result || "ok";
  }
  if (kind === "utxo") {
    const res = await fetch(`${url}/blocks/tip/height`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  }
  throw new Error(`Unsupported chain kind ${kind}`);
}
