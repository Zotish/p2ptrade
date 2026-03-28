import { createEscrow, updateEscrowStatus, getEscrowById } from "../repositories/escrows.js";
import { adjustBalance, getBalance } from "../repositories/balances.js";

export async function reserveEscrow({ offerId, buyerUserId, sellerUserId, token, amountToken }) {
  if (!sellerUserId) {
    throw new Error("Missing seller");
  }
  if (sellerUserId === buyerUserId) {
    throw new Error("Seller and buyer cannot be the same");
  }
  const balance = await getBalance(sellerUserId, token);
  if (balance < amountToken) {
    throw new Error(`Seller has insufficient ${token} balance`);
  }
  await adjustBalance(sellerUserId, token, -amountToken);
  return createEscrow({ offerId, buyerUserId, sellerUserId, token, amountToken });
}

export async function releaseEscrow(escrowId) {
  const escrow = await getEscrowById(escrowId);
  if (!escrow) return null;
  if (escrow.status === "released") return escrow;
  await adjustBalance(escrow.buyer_user_id, escrow.token, escrow.amount_token);
  return updateEscrowStatus(escrowId, "released");
}

export async function refundEscrow(escrowId) {
  const escrow = await getEscrowById(escrowId);
  if (!escrow) return null;
  if (escrow.status === "refunded") return escrow;
  await adjustBalance(escrow.seller_user_id, escrow.token, escrow.amount_token);
  return updateEscrowStatus(escrowId, "refunded");
}

export async function getEscrow(escrowId) {
  return getEscrowById(escrowId);
}
