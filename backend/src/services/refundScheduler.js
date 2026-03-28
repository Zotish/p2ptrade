import { findExpiredOrders, updateOrderStatus, findExpiredRejections } from "../repositories/orders.js";
import { refundEscrow } from "./escrow.js";
import { emitToUser } from "../socket.js";
import { getOfferById } from "../repositories/offers.js";

export function startRefundScheduler() {
  const intervalMs = 60_000; // run every minute

  setInterval(async () => {
    try {
      // 1. Auto-expire orders that timed out during payment window
      const expired = await findExpiredOrders();
      for (const order of expired) {
        await refundEscrow(order.escrow_id);
        await updateOrderStatus(order.id, "expired");
      }

      // 2. Appeal timer — auto-cancel payment_rejected orders after 24h
      const timedOutRejections = await findExpiredRejections();
      for (const order of timedOutRejections) {
        await refundEscrow(order.escrow_id);
        await updateOrderStatus(order.id, "cancelled", {
          admin_note: "Auto-cancelled: buyer did not dispute within 24 hours"
        });
        // Notify buyer
        emitToUser(order.buyer_user_id, "order:auto_cancelled", {
          orderId: order.id,
          message: "Your order was auto-cancelled because you did not raise a dispute within 24 hours."
        });
        // Notify seller
        const offer = await getOfferById(order.offer_id);
        if (offer) {
          emitToUser(offer.maker_user_id, "order:cancelled", {
            orderId: order.id,
            message: "Order auto-cancelled. Your crypto has been returned."
          });
        }
        console.log(`[scheduler] Auto-cancelled rejected order ${order.id} (24h appeal timer expired)`);
      }
    } catch (error) {
      console.error("Refund scheduler error:", error.message);
    }
  }, intervalMs);
}
