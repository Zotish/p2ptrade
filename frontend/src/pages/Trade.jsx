import { useEffect, useState } from "react";
import { useAuth } from "../authContext.jsx";
import { useSocket } from "../socketContext.jsx";
import { OfferCard } from "../components/OfferCard.jsx";
import { apiFetch } from "../api.js";

export default function Trade() {
  const { user } = useAuth();
  const socket = useSocket();
  const [orderStatus, setOrderStatus] = useState("");
  const [orderError, setOrderError] = useState("");
  const [offerId, setOfferId] = useState("");
  const [amountFiat, setAmountFiat] = useState("");
  const [activeOffer, setActiveOffer] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState("");
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [amountError, setAmountError] = useState("");
  const [country, setCountry] = useState("GH");
  const [token, setToken] = useState("USDT");
  const [offers, setOffers] = useState([]);
  const [price, setPrice] = useState(null);
  const [fxRate, setFxRate] = useState(null);
  const [marketError, setMarketError] = useState("");
  const [fiatFilter, setFiatFilter] = useState("GHS");
  const [myOffers, setMyOffers] = useState([]);
  const [myOffersError, setMyOffersError] = useState("");
  const [buyerOrders, setBuyerOrders] = useState([]);
  const [sellerOrders, setSellerOrders] = useState([]);
  const [ordersError, setOrdersError] = useState("");
  const [toasts, setToasts] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatConversations, setChatConversations] = useState([]);
  const [chatSearch, setChatSearch] = useState("");
  const [chatRecipientId, setChatRecipientId] = useState("");
  const [activeConversationId, setActiveConversationId] = useState("");
  const [activeMessages, setActiveMessages] = useState([]);
  const [chatMessage, setChatMessage] = useState("");
  const [chatError, setChatError] = useState("");
  const [offerForm, setOfferForm] = useState({
    minAmount: "",
    maxAmount: "",
    premiumPercent: "0",
    paymentMethods: ["mobile_money", "bank_transfer", "card"],
    paymentDetails: {
      bank_transfer: { bankName: "", accountName: "", accountNumber: "" },
      mobile_money: { provider: "", accountName: "", phone: "" },
      card: { provider: "", accountName: "", paymentLink: "" }
    }
  });
  const [offerStatus, setOfferStatus] = useState("");
  const [offerError, setOfferError] = useState("");
  const [fiats, setFiats] = useState([]);
  const [assets, setAssets] = useState([]);
  const [countries, setCountries] = useState([]);
  const [paymentProviders, setPaymentProviders] = useState([]);
  const PAYMENT_OPTIONS = [
    { id: "mobile_money", label: "Mobile Money" },
    { id: "bank_transfer", label: "Bank Transfer" },
    { id: "card", label: "Card" }
  ];

  const selectedCountry = countries.find((c) => c.code === country) || null;

  useEffect(() => {
    apiFetch("/admin/public-catalog")
      .then((r) => r.json())
      .then((data) => {
        const list = data.fiats || [];
        const countryList = data.countries || [];
        const assetList = data.assets || [];
        const providers = data.paymentProviders || [];
        setFiats(list);
        setCountries(countryList);
        setAssets(assetList);
        setPaymentProviders(providers);
        if (countryList.length && !countryList.find((c) => c.code === country)) {
          setCountry(countryList[0].code);
        }
        if (list.length && !list.find((f) => f.code === fiatFilter)) {
          setFiatFilter(list[0].code);
        }
        if (assetList.length && !assetList.find((a) => a.symbol === token)) {
          setToken(assetList[0].symbol);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiFetch(`/offers?country=${country}&token=${token}&fiat=${fiatFilter}`, {
      cache: "no-store"
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed to load offers");
        return data;
      })
      .then((data) => {
        setOffers(data.offers || []);
        setPrice(data.price || null);
        setFxRate(data.fxRate || null);
        setMarketError("");
      })
      .catch((err) => {
        setOffers([]);
        setPrice(null);
        setFxRate(null);
        setMarketError(err.message || "Failed to load offers");
      });
  }, [country, token, fiatFilter]);

  useEffect(() => {
    if (!fiats.length || !selectedCountry) return;
    if (fiats.find((f) => f.code === selectedCountry.fiat_code)) {
      setFiatFilter(selectedCountry.fiat_code);
    }
  }, [selectedCountry, fiats]);

  useEffect(() => {
    if (!user) {
      setMyOffers([]);
      return;
    }
    apiFetch(`/offers/mine?fiat=${fiatFilter}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed to load offers");
        return data;
      })
      .then((data) => {
        setMyOffers(data.offers || []);
        setMyOffersError("");
      })
      .catch((err) => {
        setMyOffers([]);
        setMyOffersError(err.message || "Failed to load offers");
      });
  }, [user, fiatFilter]);

  // ── Toast helper ───────────────────────────────────────────
  function showToast(message, type = "info") {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }

  // ── Orders fetch functions ──────────────────────────────────
  async function fetchBuyerOrders() {
    try {
      const r = await apiFetch(`/orders/mine?fiat=${fiatFilter}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed to load orders");
      setBuyerOrders(data.orders || []);
      setOrdersError("");
    } catch (err) {
      setBuyerOrders([]);
      setOrdersError(err.message || "Failed to load orders");
    }
  }

  async function fetchSellerOrders() {
    try {
      const r = await apiFetch(`/orders/selling?fiat=${fiatFilter}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed to load orders");
      setSellerOrders(data.orders || []);
    } catch (err) {
      setSellerOrders([]);
      setOrdersError(err.message || "Failed to load orders");
    }
  }

  // ── Initial load ────────────────────────────────────────────
  useEffect(() => {
    if (!user) {
      setBuyerOrders([]);
      setSellerOrders([]);
      return;
    }
    fetchBuyerOrders();
    fetchSellerOrders();
  }, [user, fiatFilter]);

  // ── Polling fallback (30s) — WebSocket miss হলে catch করবে ──
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      fetchBuyerOrders();
      fetchSellerOrders();
    }, 30_000);
    return () => clearInterval(id);
  }, [user, fiatFilter]);

  // ── WebSocket real-time events ──────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // Seller: Buyer payment দিয়েছে
    socket.on("order:payment_submitted", (data) => {
      fetchSellerOrders();
      showToast(
        `💰 নতুন payment! Order ${data.orderId.slice(0, 8)}… — ${data.amountFiat} ${data.fiat}`,
        "success"
      );
    });

    // Buyer: Seller confirm করে escrow release করেছে
    socket.on("order:released", (data) => {
      fetchBuyerOrders();
      showToast(
        `✅ Seller confirmed! ${data.amountToken} ${data.token} তোমার account-এ এসেছে।`,
        "success"
      );
    });

    // Buyer: Order refund হয়েছে
    socket.on("order:refunded", (data) => {
      fetchBuyerOrders();
      showToast(data?.message || "🔁 Order refund হয়েছে।", "info");
    });

    // Buyer: Seller payment reject করেছে
    socket.on("order:payment_rejected", (data) => {
      fetchBuyerOrders();
      showToast(
        `⚠️ Seller rejected your payment for Order ${data.orderId?.slice(0, 8)}. Raise a dispute if you already paid.`,
        "error"
      );
    });

    // Buyer/Seller: Dispute resolved by admin
    socket.on("order:dispute_resolved", (data) => {
      fetchBuyerOrders();
      fetchSellerOrders();
      showToast(data?.message || "⚖️ Dispute resolved by admin.", "info");
    });

    // Seller: Dispute raised by buyer
    socket.on("order:disputed", (data) => {
      fetchSellerOrders();
      showToast(
        `🚨 Buyer raised a dispute on Order ${data.orderId?.slice(0, 8)}.`,
        "error"
      );
    });

    return () => {
      socket.off("order:payment_submitted");
      socket.off("order:released");
      socket.off("order:refunded");
      socket.off("order:payment_rejected");
      socket.off("order:dispute_resolved");
      socket.off("order:disputed");
    };
  }, [socket, fiatFilter]);

  useEffect(() => {
    if (!user) {
      setChatConversations([]);
      setActiveConversationId("");
      setActiveMessages([]);
      setChatRecipientId("");
    }
  }, [user]);

  useEffect(() => {
    if (!user || !chatOpen) return;
    loadConversations();
  }, [user, chatOpen]);

  async function createOrder() {
    setOrderError("");
    setOrderStatus("");
    setAmountError("");
    try {
      if (!selectedMethod) {
        throw new Error("Select a payment method");
      }
      const amount = Number(amountFiat);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Enter a valid amount");
      }
      if (activeOffer) {
        if (amount < Number(activeOffer.min_amount)) {
          throw new Error(`Minimum is ${activeOffer.min_amount}`);
        }
        if (amount > Number(activeOffer.max_amount)) {
          throw new Error(`Maximum is ${activeOffer.max_amount}`);
        }
      }
      const res = await apiFetch("/orders", {
        method: "POST",
        body: JSON.stringify({ offerId, amountFiat: amount })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create order");
      setOrderStatus(`Order created: ${data.order.id}`);
      await submitPaymentProof(data.order.id);
      return true;
    } catch (err) {
      setOrderError(err.message || "Failed to create order");
      if (String(err.message || "").includes("Minimum") || String(err.message || "").includes("Maximum")) {
        setAmountError(err.message);
      }
      return false;
    }
  }

  async function submitPaymentProof(orderId) {
    try {
      const res = await apiFetch(`/orders/${orderId}/pay`, {
        method: "POST",
        body: JSON.stringify({
          method: selectedMethod,
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

  async function raiseDispute(orderId) {
    const reason = window.prompt("Dispute reason (briefly explain why you're disputing):");
    if (reason === null) return; // user cancelled prompt
    try {
      const res = await apiFetch(`/orders/${orderId}/dispute`, {
        method: "POST",
        body: JSON.stringify({ reason })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to raise dispute");
      setBuyerOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: "disputed", dispute_reason: reason } : o))
      );
      showToast("🚨 Dispute raised! Admin will review shortly.", "info");
    } catch (err) {
      showToast("❌ " + (err.message || "Failed to raise dispute"), "error");
    }
  }

  async function cancelOrder(orderId) {
    if (!window.confirm("Cancel this order? The seller's crypto will be returned and your payment will NOT be refunded.")) return;
    try {
      const res = await apiFetch(`/orders/${orderId}/cancel`, {
        method: "POST"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cancel");
      setBuyerOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: "cancelled" } : o))
      );
      showToast("Order cancelled.", "info");
    } catch (err) {
      showToast("❌ " + (err.message || "Cancel failed"), "error");
    }
  }

  async function confirmOrder(orderId) {
    try {
      const res = await apiFetch(`/orders/${orderId}/confirm`, {
        method: "POST"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to confirm");
      setSellerOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: "released" } : o))
      );
      showToast("✅ Payment confirmed! Escrow released to buyer.", "success");
    } catch (err) {
      showToast("❌ " + (err.message || "Confirm failed"), "error");
    }
  }

  async function rejectOrder(orderId) {
    try {
      const res = await apiFetch(`/orders/${orderId}/reject`, {
        method: "POST"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reject");
      setSellerOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: "rejected" } : o))
      );
      showToast("🚫 Order rejected. Escrow refunded.", "info");
    } catch (err) {
      showToast("❌ " + (err.message || "Reject failed"), "error");
    }
  }

  async function createOffer() {
    setOfferError("");
    setOfferStatus("");
    try {
      const minAmount = Number(offerForm.minAmount);
      const maxAmount = Number(offerForm.maxAmount);
      if (!Number.isFinite(minAmount) || minAmount <= 0) {
        throw new Error("Enter a valid minimum amount");
      }
      if (!Number.isFinite(maxAmount) || maxAmount <= 0) {
        throw new Error("Enter a valid maximum amount");
      }
      if (maxAmount < minAmount) {
        throw new Error("Max amount must be greater than min amount");
      }
      const premium = Number(offerForm.premiumPercent || 0);
      if (!Number.isFinite(premium)) {
        throw new Error("Enter a valid premium");
      }

      const res = await apiFetch("/offers", {
        method: "POST",
        body: JSON.stringify({
          country,
          token,
          fiat: selectedCountry.fiat_code,
          minAmount,
          maxAmount,
          premiumPercent: premium,
          paymentMethods: offerForm.paymentMethods,
          paymentDetails: offerForm.paymentDetails
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create offer");
      setOfferStatus(`Offer created: ${data.offer.id}`);
      setOfferForm((prev) => ({
        ...prev,
        minAmount: "",
        maxAmount: ""
      }));
      setMyOffers((prev) => [data.offer, ...prev]);
    } catch (err) {
      setOfferError(err.message || "Failed to create offer");
    }
  }

  function calcTokenAmount() {
    if (!activeOffer) return null;
    const amount = Number(amountFiat);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    const priceFiat = Number(activeOffer.price_fiat);
    if (!Number.isFinite(priceFiat) || priceFiat <= 0) return null;
    const tokenAmount = amount / priceFiat;
    return tokenAmount;
  }

  function openTrade(offer) {
    setActiveOffer(offer);
    setOfferId(offer.id);
    setAmountFiat(String(offer.min_amount || ""));
    setSelectedMethod("");
    setPaymentDetails(null);
    setPaymentReference("");
    setPaymentNote("");
    apiFetch(`/offers/${offer.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.offer?.payment_details) {
          setActiveOffer((prev) => ({ ...prev, payment_details: data.offer.payment_details }));
        }
      })
      .catch(() => {});
  }

  function closeTrade() {
    setActiveOffer(null);
  }

  function togglePaymentMethod(method) {
    setOfferForm((prev) => {
      const exists = prev.paymentMethods.includes(method);
      return {
        ...prev,
        paymentMethods: exists
          ? prev.paymentMethods.filter((m) => m !== method)
          : [...prev.paymentMethods, method]
      };
    });
  }

  async function loadConversations() {
    try {
      const res = await apiFetch("/chat/conversations");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load conversations");
      setChatConversations(data.conversations || []);
    } catch (err) {
      setChatError(err.message || "Failed to load conversations");
    }
  }

  async function openConversation(conversationId) {
    try {
      setChatError("");
      setActiveConversationId(conversationId);
      const res = await apiFetch(`/chat/conversations/${conversationId}/messages`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load messages");
      setActiveMessages(data.messages || []);
    } catch (err) {
      setChatError(err.message || "Failed to load messages");
    }
  }

  async function startConversation(recipientId) {
    if (!recipientId) {
      setChatError("Provide recipient user id");
      return;
    }
    try {
      setChatError("");
      const res = await apiFetch("/chat/conversations", {
        method: "POST",
        body: JSON.stringify({ recipientId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start chat");
      setChatRecipientId("");
      setChatOpen(true);
      await loadConversations();
      if (data.conversation?.id) {
        await openConversation(data.conversation.id);
      }
    } catch (err) {
      setChatError(err.message || "Failed to start chat");
    }
  }

  function startChatWithSeller(offer) {
    if (!user || !offer?.maker_user_id || offer.maker_user_id === user.id) return;
    setChatOpen(true);
    startConversation(offer.maker_user_id);
  }

  function copyText(value, label = "Copied") {
    if (!value) return;
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(value).then(
        () => {
          setChatError(label);
          setTimeout(() => setChatError(""), 1200);
        },
        () => setChatError("Copy failed")
      );
      return;
    }
    setChatError("Copy not supported");
  }

  const filteredConversations = chatConversations.filter((c) => {
    if (!chatSearch) return true;
    const label = `${c.otherUser?.email || ""} ${c.otherUser?.handle || ""} ${c.otherUser?.id || ""} ${c.id || ""}`.toLowerCase();
    return label.includes(chatSearch.toLowerCase());
  });

  const activeConversation = chatConversations.find((c) => c.id === activeConversationId) || null;
  const activeOther = activeConversation?.otherUser || null;
  const providerOptions = paymentProviders.filter(
    (p) => p.country_code === selectedCountry?.code && p.is_active
  );
  const providerByMethod = (method) =>
    providerOptions.filter((p) => p.method === method).map((p) => p.name);

  return (
    <>
      {/* Toast notifications */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.message}
          </div>
        ))}
      </div>

      <section className="hero compact">
        <div>
          <p className="kicker">Trade</p>
          <h1>Start a P2P trade</h1>
          <p className="sub">Choose an offer and create an order.</p>
        </div>
        <div className="card">
          <h3>Market Price</h3>
          <p className="price">
            {price
              ? fxRate
                ? `${token} ${Number(price.usd * fxRate).toFixed(6)} ${fiatFilter}`
                : `${token} $${price.usd}`
              : marketError
                ? "Price unavailable"
                : "Loading..."}
          </p>
          <p className="muted">Source: {price?.source || "-"}</p>
          {marketError && <p className="error">{marketError}</p>}
        </div>
      </section>

      <section className="filters">
        <label>
          Country
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            disabled={!countries.length}
          >
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.fiat_code})
              </option>
            ))}
          </select>
        </label>
        <label>
          Token
          <select value={token} onChange={(e) => setToken(e.target.value)}>
            {(assets.length ? assets.map((a) => a.symbol) : ["BTC", "USDT", "USDC", "BNB", "SOL", "ETH"]).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fiat
          <select value={fiatFilter} disabled>
            {fiats.map((f) => (
              <option key={f.code} value={f.code}>
                {f.code} - {f.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="grid">
        {offers.length === 0 && <div className="empty">No offers found.</div>}
        {offers.map((offer) => (
          <div key={offer.id} className="trade-card">
            <OfferCard
              offer={offer}
              onAction={user ? () => openTrade(offer) : undefined}
              actionLabel="Start Trade"
              onChat={user && offer.maker_user_id && offer.maker_user_id !== user.id ? () => startChatWithSeller(offer) : undefined}
              chatLabel="Chat Seller"
            />
          </div>
        ))}
      </section>

      {activeOffer && (
        <div className="modal-backdrop" onClick={closeTrade}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Start Trade</h3>
            <p className="muted">Offer: {activeOffer.token} → {activeOffer.fiat}</p>
            <div className="pay-grid">
              <label>
                Offer ID
                <input value={offerId} onChange={(e) => setOfferId(e.target.value)} />
              </label>
              <label>
                Amount (Fiat)
                <input
                  value={amountFiat}
                  onChange={(e) => setAmountFiat(e.target.value)}
                  placeholder={`${activeOffer.min_amount} - ${activeOffer.max_amount}`}
                />
              </label>
            </div>
            <p className="muted small">
              Range: {activeOffer.min_amount} - {activeOffer.max_amount} {activeOffer.fiat}
            </p>
            <div className="pay-grid">
              <label>
                Payment Method
                <select
                  value={selectedMethod}
                  onChange={(e) => {
                    const method = e.target.value;
                    setSelectedMethod(method);
                    const details = activeOffer?.payment_details || null;
                    setPaymentDetails(details ? details[method] || null : null);
                  }}
                >
                  <option value="">Select method</option>
                  {(Array.isArray(activeOffer.payment_methods) ? activeOffer.payment_methods : typeof activeOffer.payment_methods === "string" ? (() => { try { return JSON.parse(activeOffer.payment_methods); } catch { return activeOffer.payment_methods.split(",").map(s => s.trim()).filter(Boolean); } })() : []).map((m) => (
                    <option key={m} value={m}>
                      {m.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Payment Reference
                <input
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="Transaction reference"
                />
              </label>
              <label>
                Note
                <input
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                  placeholder="Optional note"
                />
              </label>
            </div>
            {paymentDetails && (
              <div className="wallet-card compact-card">
                <p className="kicker">Seller Payment Details</p>
                {selectedMethod === "bank_transfer" && (
                  <p className="muted small">
                    Bank: {paymentDetails.bankName} | {paymentDetails.accountName} | {paymentDetails.accountNumber}
                  </p>
                )}
                {selectedMethod === "mobile_money" && (
                  <p className="muted small">
                    Mobile Money: {paymentDetails.provider} | {paymentDetails.accountName} | {paymentDetails.phone}
                  </p>
                )}
                {selectedMethod === "card" && (
                  <p className="muted small">
                    Card: {paymentDetails.provider} | {paymentDetails.accountName} | {paymentDetails.paymentLink}
                  </p>
                )}
              </div>
            )}
            {calcTokenAmount() != null && (
              <p className="muted small">
                You will receive approximately {calcTokenAmount().toFixed(8)} {activeOffer.token}
              </p>
            )}
            {amountError && <p className="error">{amountError}</p>}
            {orderError && <p className="error">{orderError}</p>}
            <div className="auth-actions">
              <button className="ghost" onClick={closeTrade}>Cancel</button>
              <button
                className="cta"
                disabled={!user}
                onClick={async () => {
                  const ok = await createOrder();
                  if (ok) closeTrade();
                }}
              >
                Pay & Create Order
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="payments">
        <div className="wallet-card">
          <div className="wallet-head">
            <div>
              <p className="kicker">Seller</p>
              <h3>Create an Offer</h3>
              <p className="muted">List your price and payment methods for buyers.</p>
            </div>
          </div>
          {!user && <p className="muted">Sign in to create offers.</p>}
          {user && !selectedCountry && (
            <p className="muted">No active countries configured. Add a country in admin.</p>
          )}
          {user && selectedCountry && (
            <>
              <div className="pay-grid">
                <label>
                  Local Currency
                  <input value={selectedCountry.fiat_code} disabled />
                </label>
                <label>
                  Min Amount ({selectedCountry.fiat_code})
                  <input
                    value={offerForm.minAmount}
                    onChange={(e) => setOfferForm((prev) => ({ ...prev, minAmount: e.target.value }))}
                    placeholder="100"
                  />
                </label>
                <label>
                  Max Amount ({selectedCountry.fiat_code})
                  <input
                    value={offerForm.maxAmount}
                    onChange={(e) => setOfferForm((prev) => ({ ...prev, maxAmount: e.target.value }))}
                    placeholder="5000"
                  />
                </label>
                <label>
                  Premium (%)
                  <input
                    value={offerForm.premiumPercent}
                    onChange={(e) => setOfferForm((prev) => ({ ...prev, premiumPercent: e.target.value }))}
                    placeholder="0"
                  />
                </label>
              </div>
              <div className="pay-grid">
                {PAYMENT_OPTIONS.map((opt) => (
                  <label key={opt.id} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={offerForm.paymentMethods.includes(opt.id)}
                      onChange={() => togglePaymentMethod(opt.id)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              {offerForm.paymentMethods.includes("bank_transfer") && (
                <div className="pay-grid">
                  <label>
                    Bank Name
                    <input
                      list="bank-providers"
                      value={offerForm.paymentDetails.bank_transfer.bankName}
                      onChange={(e) =>
                        setOfferForm((prev) => ({
                          ...prev,
                          paymentDetails: {
                            ...prev.paymentDetails,
                            bank_transfer: {
                              ...prev.paymentDetails.bank_transfer,
                              bankName: e.target.value
                            }
                          }
                        }))
                      }
                    />
                  </label>
                  <label>
                    Account Name
                    <input
                      value={offerForm.paymentDetails.bank_transfer.accountName}
                      onChange={(e) =>
                        setOfferForm((prev) => ({
                          ...prev,
                          paymentDetails: {
                            ...prev.paymentDetails,
                            bank_transfer: {
                              ...prev.paymentDetails.bank_transfer,
                              accountName: e.target.value
                            }
                          }
                        }))
                      }
                    />
                  </label>
                  <label>
                    Account Number
                    <input
                      value={offerForm.paymentDetails.bank_transfer.accountNumber}
                      onChange={(e) =>
                        setOfferForm((prev) => ({
                          ...prev,
                          paymentDetails: {
                            ...prev.paymentDetails,
                            bank_transfer: {
                              ...prev.paymentDetails.bank_transfer,
                              accountNumber: e.target.value
                            }
                          }
                        }))
                      }
                    />
                  </label>
                </div>
              )}
              {offerForm.paymentMethods.includes("mobile_money") && (
                <div className="pay-grid">
                  <label>
                    Provider
                    <input
                      list="mobile-providers"
                      value={offerForm.paymentDetails.mobile_money.provider}
                      onChange={(e) =>
                        setOfferForm((prev) => ({
                          ...prev,
                          paymentDetails: {
                            ...prev.paymentDetails,
                            mobile_money: {
                              ...prev.paymentDetails.mobile_money,
                              provider: e.target.value
                            }
                          }
                        }))
                      }
                    />
                  </label>
                  <label>
                    Account Name
                    <input
                      value={offerForm.paymentDetails.mobile_money.accountName}
                      onChange={(e) =>
                        setOfferForm((prev) => ({
                          ...prev,
                          paymentDetails: {
                            ...prev.paymentDetails,
                            mobile_money: {
                              ...prev.paymentDetails.mobile_money,
                              accountName: e.target.value
                            }
                          }
                        }))
                      }
                    />
                  </label>
                  <label>
                    Phone Number
                    <input
                      value={offerForm.paymentDetails.mobile_money.phone}
                      onChange={(e) =>
                        setOfferForm((prev) => ({
                          ...prev,
                          paymentDetails: {
                            ...prev.paymentDetails,
                            mobile_money: {
                              ...prev.paymentDetails.mobile_money,
                              phone: e.target.value
                            }
                          }
                        }))
                      }
                    />
                  </label>
                </div>
              )}
              {offerForm.paymentMethods.includes("card") && (
                <div className="pay-grid">
                  <label>
                    Card Provider
                    <input
                      list="card-providers"
                      value={offerForm.paymentDetails.card.provider}
                      onChange={(e) =>
                        setOfferForm((prev) => ({
                          ...prev,
                          paymentDetails: {
                            ...prev.paymentDetails,
                            card: {
                              ...prev.paymentDetails.card,
                              provider: e.target.value
                            }
                          }
                        }))
                      }
                    />
                  </label>
                  <label>
                    Account Name
                    <input
                      value={offerForm.paymentDetails.card.accountName}
                      onChange={(e) =>
                        setOfferForm((prev) => ({
                          ...prev,
                          paymentDetails: {
                            ...prev.paymentDetails,
                            card: {
                              ...prev.paymentDetails.card,
                              accountName: e.target.value
                            }
                          }
                        }))
                      }
                    />
                  </label>
                  <label>
                    Payment Link
                    <input
                      value={offerForm.paymentDetails.card.paymentLink}
                      onChange={(e) =>
                        setOfferForm((prev) => ({
                          ...prev,
                          paymentDetails: {
                            ...prev.paymentDetails,
                            card: {
                              ...prev.paymentDetails.card,
                              paymentLink: e.target.value
                            }
                          }
                        }))
                      }
                    />
                  </label>
                </div>
              )}
              <datalist id="bank-providers">
                {providerByMethod("bank_transfer").map((name) => (
                  <option key={`bank-${name}`} value={name} />
                ))}
              </datalist>
              <datalist id="mobile-providers">
                {providerByMethod("mobile_money").map((name) => (
                  <option key={`mobile-${name}`} value={name} />
                ))}
              </datalist>
              <datalist id="card-providers">
                {providerByMethod("card").map((name) => (
                  <option key={`card-${name}`} value={name} />
                ))}
              </datalist>
              <button className="cta" onClick={createOffer}>
                Create Offer
              </button>
              {offerError && <p className="error">{offerError}</p>}
              {offerStatus && <p className="muted">{offerStatus}</p>}
            </>
          )}
        </div>

        <div className="wallet-card">
          <div className="wallet-head">
            <div>
              <p className="kicker">Seller</p>
              <h3>Your Offers</h3>
              <p className="muted">Offers you created for {fiatFilter}.</p>
            </div>
          </div>
          {!user && <p className="muted">Sign in to see your offers.</p>}
          {user && (
            <div className="grid">
              {myOffers.length === 0 && <div className="empty">No offers yet.</div>}
              {myOffers.map((offer) => (
                <OfferCard key={offer.id} offer={offer} />
              ))}
            </div>
          )}
          {myOffersError && <p className="error">{myOffersError}</p>}
        </div>

        <div className="wallet-card">
          <div className="wallet-head">
            <div>
              <p className="kicker">Orders</p>
              <h3>Filter by Local Currency</h3>
              <p className="muted">See buyer and seller orders by currency.</p>
            </div>
            <div className="wallet-actions">
          <select value={fiatFilter} disabled>
            {fiats.map((f) => (
              <option key={f.code} value={f.code}>
                {f.code} - {f.name}
              </option>
            ))}
          </select>
            </div>
          </div>
          {!user && <p className="muted">Sign in to view orders.</p>}
          {user && (
            <div className="orders-grid">
              <div className="orders-panel">
                <h4>Buyer Orders</h4>
                {buyerOrders.length === 0 && <div className="empty">No buyer orders.</div>}
                {buyerOrders.map((order) => (
                  <div key={order.id} className={`seller-order-card ${order.status === "payment_rejected" ? "seller-order-card--rejected" : ""} ${order.status === "disputed" ? "seller-order-card--disputed" : ""}`}>

                    {/* Top row */}
                    <div className="seller-order-top">
                      <div>
                        <strong className="seller-order-pair">{order.offer?.token} / {order.offer?.fiat}</strong>
                        <span className="muted small"> · #{order.id.slice(0, 8)}</span>
                      </div>
                      <span className={`status-badge status-${order.status}`}>{order.status.replace(/_/g, " ")}</span>
                    </div>

                    {/* Amounts */}
                    <div className="seller-order-amounts">
                      <div><p className="muted small">Fiat Amount</p><strong>{order.amount_fiat} {order.offer?.fiat}</strong></div>
                      <div><p className="muted small">Crypto Amount</p><strong>{order.amount_token} {order.offer?.token}</strong></div>
                      <div><p className="muted small">Rate</p><strong>{order.offer?.price_fiat} {order.offer?.fiat}</strong></div>
                    </div>

                    {/* Payment submitted info */}
                    {order.payment && (
                      <div className="seller-order-section">
                        <p className="seller-order-label">💳 Your Payment Proof</p>
                        <div className="seller-order-info-grid">
                          <div><span className="muted small">Method</span><strong>{order.payment.method?.replace(/_/g, " ")}</strong></div>
                          {order.payment.reference && <div><span className="muted small">Reference</span><strong className="ref-code">{order.payment.reference}</strong></div>}
                          {order.payment.note && <div style={{gridColumn:"1/-1"}}><span className="muted small">Note</span><strong>{order.payment.note}</strong></div>}
                        </div>
                      </div>
                    )}

                    {/* ⚠️ Seller rejected — Buyer action required */}
                    {order.status === "payment_rejected" && (
                      <div className="dispute-alert">
                        <p className="dispute-alert-title">⚠️ Seller rejected your payment</p>
                        <p className="muted small">If you already sent the money, raise a dispute. Admin will review and release your crypto. If you made a mistake, you can cancel.</p>
                        <div className="dispute-actions">
                          <button className="cta" onClick={() => raiseDispute(order.id)}>🚨 Raise Dispute</button>
                          <button className="ghost danger" onClick={() => cancelOrder(order.id)}>Cancel Order</button>
                        </div>
                      </div>
                    )}

                    {/* Disputed — waiting for admin */}
                    {order.status === "disputed" && (
                      <div className="dispute-pending">
                        <p>🔍 <strong>Dispute under review</strong> — Admin is reviewing your case. You will be notified once resolved.</p>
                        {order.dispute_reason && <p className="muted small">Your reason: {order.dispute_reason}</p>}
                      </div>
                    )}

                  </div>
                ))}
              </div>
              <div className="orders-panel">
                <h4>Seller Orders</h4>
                {sellerOrders.length === 0 && <div className="empty">No seller orders.</div>}
                {sellerOrders.map((order) => (
                  <div key={order.id} className={`seller-order-card ${order.status === "payment_submitted" ? "seller-order-card--alert" : ""}`}>

                    {/* ── Top row: token/amount + status ── */}
                    <div className="seller-order-top">
                      <div>
                        <strong className="seller-order-pair">{order.offer?.token} / {order.offer?.fiat}</strong>
                        <span className="muted small"> · #{order.id.slice(0, 8)}</span>
                      </div>
                      <span className={`status-badge status-${order.status}`}>{order.status.replace(/_/g, " ")}</span>
                    </div>

                    {/* ── Amounts ── */}
                    <div className="seller-order-amounts">
                      <div>
                        <p className="muted small">Fiat Amount</p>
                        <strong>{order.amount_fiat} {order.offer?.fiat}</strong>
                      </div>
                      <div>
                        <p className="muted small">Crypto Amount</p>
                        <strong>{order.amount_token} {order.offer?.token}</strong>
                      </div>
                      <div>
                        <p className="muted small">Rate</p>
                        <strong>{order.offer?.price_fiat} {order.offer?.fiat}</strong>
                      </div>
                    </div>

                    {/* ── Buyer Info ── */}
                    {order.buyer && (
                      <div className="seller-order-section">
                        <p className="seller-order-label">👤 Buyer Information</p>
                        <div className="seller-order-info-grid">
                          {order.buyer.full_name && <div><span className="muted small">Name</span><strong>{order.buyer.full_name}</strong></div>}
                          {order.buyer.email    && <div><span className="muted small">Email</span><strong>{order.buyer.email}</strong></div>}
                          {order.buyer.phone    && <div><span className="muted small">Phone</span><strong>{order.buyer.phone}</strong></div>}
                          {order.buyer.handle   && <div><span className="muted small">Handle</span><strong>@{order.buyer.handle}</strong></div>}
                        </div>
                      </div>
                    )}

                    {/* ── Payment Proof (only when submitted) ── */}
                    {order.payment && (
                      <div className="seller-order-section seller-order-proof">
                        <p className="seller-order-label">💳 Payment Proof</p>
                        <div className="seller-order-info-grid">
                          <div><span className="muted small">Method</span><strong>{order.payment.method?.replace(/_/g, " ")}</strong></div>
                          {order.payment.reference && <div><span className="muted small">Reference / TXN ID</span><strong className="ref-code">{order.payment.reference}</strong></div>}
                          {order.payment.note      && <div style={{gridColumn:"1/-1"}}><span className="muted small">Note</span><strong>{order.payment.note}</strong></div>}
                        </div>
                      </div>
                    )}

                    {/* ── Action Buttons (only for payment_submitted) ── */}
                    {order.status === "payment_submitted" && (
                      <div className="seller-order-actions">
                        <button className="cta" onClick={() => confirmOrder(order.id)}>
                          ✅ Confirm & Release
                        </button>
                        <button className="ghost danger" onClick={() => rejectOrder(order.id)}>
                          ❌ Reject
                        </button>
                      </div>
                    )}

                  </div>
                ))}
              </div>
            </div>
          )}
          {ordersError && <p className="error">{ordersError}</p>}
        </div>
      </section>

      <div className={`chat-shell ${chatOpen ? "open" : ""}`}>
        <button className="chat-fab" onClick={() => setChatOpen((prev) => !prev)}>
          {chatOpen ? "Close Chat" : "Chat"}
        </button>
        {chatOpen && (
          <div className="chat-panel">
            <div className="chat-header">
              <div>
                <p className="kicker">Chat</p>
                <h3>Messages</h3>
                <p className="muted">Talk with multiple users like Messenger.</p>
                {user && (
                  <div className="chat-id">
                    <span className="muted small">Your User ID: {user.id}</span>
                    <button className="ghost small-btn" onClick={() => copyText(user.id, "User ID copied")}>
                      Copy
                    </button>
                  </div>
                )}
              </div>
              {user && (
                <div className="chat-header-actions">
                  <button className="ghost" onClick={loadConversations}>Refresh</button>
                </div>
              )}
            </div>
            {!user && <p className="muted">Sign in to use chat.</p>}
            {user && (
              <>
                <div className="chat-topbar">
                  <input
                    placeholder="Search chats..."
                    value={chatSearch}
                    onChange={(e) => setChatSearch(e.target.value)}
                  />
                  <div className="chat-start">
                    <input
                      placeholder="Recipient User ID"
                      value={chatRecipientId}
                      onChange={(e) => setChatRecipientId(e.target.value)}
                    />
                    <button className="ghost" onClick={() => startConversation(chatRecipientId)}>
                      Start Chat
                    </button>
                  </div>
                </div>
                <div className="chat-layout">
                  <div className="chat-sidebar">
                    <div className="chat-list">
                      {filteredConversations.length === 0 && <p className="muted">No conversations.</p>}
                      {filteredConversations.map((c) => (
                        <button
                          key={c.id}
                          className={`chat-list-item ${activeConversationId === c.id ? "active" : ""}`}
                          onClick={() => openConversation(c.id)}
                        >
                          <span>{c.otherUser?.handle || c.otherUser?.email || c.otherUser?.id || c.id}</span>
                          {c.otherUser?.email && (
                            <span className="muted small">{c.otherUser.email}</span>
                          )}
                          {c.otherUser?.id && (
                            <span className="muted small">ID: {c.otherUser.id}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="chat-thread">
                    {chatError && <p className="error">{chatError}</p>}
                    {activeOther && (
                      <div className="chat-thread-head">
                        <div>
                          <strong>{activeOther.handle || activeOther.email || "Chat"}</strong>
                          {activeOther.id && <div className="muted small">User ID: {activeOther.id}</div>}
                        </div>
                        {activeOther.id && (
                          <button className="ghost small-btn" onClick={() => copyText(activeOther.id, "Recipient ID copied")}>
                            Copy ID
                          </button>
                        )}
                      </div>
                    )}
                    <div className="chat-stream">
                      {activeConversationId && activeMessages.length === 0 && (
                        <p className="muted">No messages yet.</p>
                      )}
                      {!activeConversationId && <p className="muted">Select a chat to start.</p>}
                      {activeMessages.map((msg) => {
                        const isSelf = msg.sender_id === user?.id;
                        return (
                          <div key={msg.id} className={`chat-bubble ${isSelf ? "self" : "other"}`}>
                            <p className="chat-meta">{isSelf ? "You" : msg.sender_id}</p>
                            <p className="chat-text">{msg.message}</p>
                            <p className="muted small">{msg.created_at}</p>
                          </div>
                        );
                      })}
                    </div>
                    <div className="chat-input">
                      <input
                        value={chatMessage}
                        onChange={(e) => setChatMessage(e.target.value)}
                        placeholder="Type a message..."
                      />
                      <button
                        className="cta"
                        disabled={!activeConversationId || !chatMessage}
                        onClick={async () => {
                          if (!activeConversationId || !chatMessage) return;
                          const res = await apiFetch(`/chat/conversations/${activeConversationId}/messages`, {
                            method: "POST",
                            body: JSON.stringify({ message: chatMessage })
                          });
                          const data = await res.json();
                          if (res.ok) {
                            setActiveMessages((prev) => [...prev, data.message]);
                            setChatMessage("");
                          } else {
                            setChatError(data.error || "Failed to send message");
                          }
                        }}
                      >
                        Send
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
