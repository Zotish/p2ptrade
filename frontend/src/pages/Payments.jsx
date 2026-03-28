import { useState } from "react";
import { useAuth } from "../authContext.jsx";

export default function Payments() {
  const { user } = useAuth();
  const [orderStatus, setOrderStatus] = useState("");
  const [orderError, setOrderError] = useState("");
  const [orderId, setOrderId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [sellerActionId, setSellerActionId] = useState("");
  const [orderDetails, setOrderDetails] = useState(null);
  const [detailsError, setDetailsError] = useState("");


  async function submitPayment() {
    if (!orderId) {
      setOrderError("Create an order first");
      return;
    }
    setOrderError("");
    setOrderStatus("");
    try {
      const res = await fetch(`${API_URL}/orders/${orderId}/pay`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: paymentMethod,
          reference: paymentReference,
          note: paymentNote
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Payment submission failed");
      setOrderStatus("Payment submitted. Waiting for seller confirmation.");
    } catch (err) {
      setOrderError(err.message || "Payment submission failed");
    }
  }

  async function sellerConfirm() {
    if (!sellerActionId) {
      setOrderError("Provide an order id to confirm");
      return;
    }
    setOrderError("");
    setOrderStatus("");
    try {
      const res = await fetch(`${API_URL}/orders/${sellerActionId}/confirm`, {
        method: "POST",
        credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Confirmation failed");
      setOrderStatus("Seller confirmed. Escrow released.");
    } catch (err) {
      setOrderError(err.message || "Confirmation failed");
    }
  }

  async function loadOrderDetails() {
    if (!orderId) {
      setDetailsError("Provide an order id");
      return;
    }
    setDetailsError("");
    try {
      const res = await fetch(`${API_URL}/orders/${orderId}`, {
        credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load order");
      setOrderDetails(data);
    } catch (err) {
      setOrderDetails(null);
      setDetailsError(err.message || "Failed to load order");
    }
  }

  async function sellerReject() {
    if (!sellerActionId) {
      setOrderError("Provide an order id to reject");
      return;
    }
    setOrderError("");
    setOrderStatus("");
    try {
      const res = await fetch(`${API_URL}/orders/${sellerActionId}/reject`, {
        method: "POST",
        credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Rejection failed");
      setOrderStatus("Seller rejected payment.");
    } catch (err) {
      setOrderError(err.message || "Rejection failed");
    }
  }

  if (!user) {
    return (
      <section className="payments" id="payments">
        <div className="wallet-card">
          <h3>Payments</h3>
          <p className="muted">Sign in to submit and confirm payments.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="payments" id="payments">
      <div className="wallet-card">
        <div className="wallet-head">
          <div>
            <p className="kicker">Payment Flow</p>
            <h3>Manual Confirmation</h3>
            <p className="muted">Buyer submits payment proof. Seller confirms or rejects.</p>
          </div>
        </div>

        <div className="pay-grid">
          <label>
            Order ID
            <input value={orderId} onChange={(e) => setOrderId(e.target.value)} />
          </label>
          <label>
            Payment Method
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="card">Card</option>
            </select>
          </label>
          <label>
            Reference
            <input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="Transaction ref" />
          </label>
          <label>
            Note
            <input value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} placeholder="Extra details" />
          </label>
        </div>
        <div className="auth-actions">
          <button className="ghost" disabled={!user} onClick={loadOrderDetails}>
            Load Order Details
          </button>
        </div>
        {detailsError && <p className="error">{detailsError}</p>}
        {orderDetails?.offer?.payment_details && (
          <div className="wallet-card compact-card">
            <p className="kicker">Seller Payment Details</p>
            {orderDetails.offer.payment_details.bank_transfer && (
              <div className="muted small">
                <strong>Bank</strong>: {orderDetails.offer.payment_details.bank_transfer.bankName} |
                {orderDetails.offer.payment_details.bank_transfer.accountName} |
                {orderDetails.offer.payment_details.bank_transfer.accountNumber}
              </div>
            )}
            {orderDetails.offer.payment_details.mobile_money && (
              <div className="muted small">
                <strong>Mobile Money</strong>: {orderDetails.offer.payment_details.mobile_money.provider} |
                {orderDetails.offer.payment_details.mobile_money.accountName} |
                {orderDetails.offer.payment_details.mobile_money.phone}
              </div>
            )}
            {orderDetails.offer.payment_details.card && (
              <div className="muted small">
                <strong>Card</strong>: {orderDetails.offer.payment_details.card.provider} |
                {orderDetails.offer.payment_details.card.accountName} |
                {orderDetails.offer.payment_details.card.paymentLink}
              </div>
            )}
          </div>
        )}
        <button className="ghost" disabled={!user} onClick={submitPayment}>
          Submit Payment Proof
        </button>

        <div className="pay-grid">
          <label>
            Seller: Order ID
            <input value={sellerActionId} onChange={(e) => setSellerActionId(e.target.value)} placeholder="order_id" />
          </label>
        </div>
        <div className="auth-actions">
          <button className="ghost" disabled={!user} onClick={sellerReject}>
            Reject Payment
          </button>
          <button className="cta" disabled={!user} onClick={sellerConfirm}>
            Confirm & Release
          </button>
        </div>

        {orderError && <p className="error">{orderError}</p>}
        {orderStatus && <p className="muted">{orderStatus}</p>}
      </div>
    </section>
  );
}
