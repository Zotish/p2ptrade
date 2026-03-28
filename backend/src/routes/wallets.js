import { Router } from "express";
import { requireAuth } from "../auth.js";
import { getOrCreateAddress, getSupportedChains, getUserAddresses } from "../services/walletService.js";
import { requestWithdrawal, estimateWithdrawalFee } from "../services/withdrawService.js";
import { adjustBalance, getBalance } from "../repositories/balances.js";
import { listDepositsForUser, listWithdrawalsForUser } from "../repositories/history.js";
import { scanBnbTx, scanSolTx } from "../services/scanService.js";
import { listActiveAssets, listActiveDepositAssets, listActiveWithdrawalAssets, listChains } from "../repositories/admin.js";

export const walletsRouter = Router();

walletsRouter.get("/chains", async (req, res) => {
  const chains = await getSupportedChains();
  res.json({ chains });
});

walletsRouter.get("/catalog", async (req, res) => {
  const supported = new Set(await getSupportedChains());
  const [depositAssets, withdrawalAssets, chains] = await Promise.all([
    listActiveDepositAssets(),
    listActiveWithdrawalAssets(),
    listChains()
  ]);
  const activeChains = chains.filter((chain) => chain.is_active && supported.has(chain.code));
  const chainMap = new Map(activeChains.map((chain) => [chain.code, chain]));
  const filteredDepositAssets = depositAssets
    .filter((asset) => supported.has(asset.chain_code))
    .map((asset) => ({
      ...asset,
      chain_name: chainMap.get(asset.chain_code)?.name || asset.chain_code
    }));
  res.json({
    depositAssets: filteredDepositAssets,
    withdrawalAssets: withdrawalAssets.filter((asset) => supported.has(asset.chain_code))
  });
});

walletsRouter.get("/addresses", requireAuth, async (req, res) => {
  const addresses = await getUserAddresses(req.user.id);
  res.json({ addresses });
});

walletsRouter.post("/address", requireAuth, async (req, res) => {
  const { chain } = req.body || {};
  if (!chain) return res.status(400).json({ error: "Missing chain" });
  try {
    const address = await getOrCreateAddress(req.user.id, chain);
    res.json({ address });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

walletsRouter.get("/balances", requireAuth, async (req, res) => {
  const supported = new Set(await getSupportedChains());
  const activeAssets = await listActiveAssets();
  const assets = activeAssets.filter((asset) => supported.has(asset.chain_code)).map((asset) => asset.symbol);
  const balances = {};
  for (const asset of assets) {
    balances[asset] = await getBalance(req.user.id, asset);
  }
  res.json({ balances });
});

walletsRouter.get("/deposits", requireAuth, async (req, res) => {
  const deposits = await listDepositsForUser(req.user.id);
  res.json({ deposits });
});

walletsRouter.get("/withdrawals", requireAuth, async (req, res) => {
  const withdrawals = await listWithdrawalsForUser(req.user.id);
  res.json({ withdrawals });
});

// GET /wallets/withdraw/estimate?asset=BTC
// Returns: fee, feeAsset, balance, maxWithdrawable
walletsRouter.get("/withdraw/estimate", requireAuth, async (req, res) => {
  const { asset } = req.query;
  if (!asset) return res.status(400).json({ error: "Missing asset" });
  try {
    const result = await estimateWithdrawalFee({ userId: req.user.id, asset });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

walletsRouter.post("/withdraw", requireAuth, async (req, res) => {
  const { chain, asset, toAddress, amount } = req.body || {};
  if (!chain || !asset || !toAddress || !amount) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  try {
    const record = await requestWithdrawal({
      userId: req.user.id,
      chain,
      asset,
      toAddress,
      amount: Number(amount)
    });
    res.json({ withdrawal: record });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

walletsRouter.post("/credit", requireAuth, async (req, res) => {
  const { asset, amount } = req.body || {};
  if (!asset || !amount) return res.status(400).json({ error: "Missing asset/amount" });
  const newBal = await adjustBalance(req.user.id, asset, Number(amount));
  res.json({ balance: newBal });
});

walletsRouter.post("/scan/bnb", requireAuth, async (req, res) => {
  const { txhash } = req.body || {};
  if (!txhash) return res.status(400).json({ error: "Missing txhash" });
  try {
    const result = await scanBnbTx(txhash);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

walletsRouter.post("/scan/sol", requireAuth, async (req, res) => {
  const { txhash } = req.body || {};
  if (!txhash) return res.status(400).json({ error: "Missing txhash" });
  try {
    const result = await scanSolTx(txhash, req.user.id);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
