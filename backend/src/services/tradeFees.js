import { getAssetBySymbol } from "../repositories/admin.js";
import { updateOrderFee } from "../repositories/orders.js";
import { addPlatformFee } from "../repositories/platformFees.js";

const DEFAULT_FEE_BPS = 30;

export async function applyTradeFee(order, offer) {
  if (!order || !offer) return order;
  if (order.fee_amount != null && order.fee_asset) {
    return order;
  }

  const asset = await getAssetBySymbol(offer.token);
  const feeBps = Number.isFinite(Number(asset?.fee_bps))
    ? Number(asset.fee_bps)
    : DEFAULT_FEE_BPS;
  const feeAddress = asset?.fee_address || null;
  const amountToken = Number(order.amount_token || 0);
  const feeAmount = Number(((amountToken * feeBps) / 10000).toFixed(8));

  const updated = await updateOrderFee(order.id, {
    fee_bps: feeBps,
    fee_amount: feeAmount,
    fee_asset: offer.token,
    fee_address: feeAddress
  });
  if (feeAmount > 0) {
    await addPlatformFee(offer.token, feeAmount);
  }
  return updated;
}
