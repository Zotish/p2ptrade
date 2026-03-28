import { API_URL } from "./config.js";
import { useEffect, useState } from "react";
import { OfferCard } from "./components/OfferCard.jsx";
import { Link } from "react-router-dom";

const COUNTRIES = [
  { code: "GH", name: "Ghana", currency: "GHS" },
  { code: "NG", name: "Nigeria", currency: "NGN" },
  { code: "KE", name: "Kenya", currency: "KES" },
  { code: "ZA", name: "South Africa", currency: "ZAR" },
  { code: "ZM", name: "Zambia", currency: "ZMW" }
];

const TOKENS = ["BTC", "USDT", "USDC", "BNB", "SOL", "ETH"];

export default function App() {
  const [country, setCountry] = useState("GH");
  const [token, setToken] = useState("USDT");
  const [offers, setOffers] = useState([]);
  const [price, setPrice] = useState(null);
  const [error, setError] = useState("");
  const [announcements, setAnnouncements] = useState([]);
  const [metrics, setMetrics] = useState({
    liveUsers: 0,
    totalUsers: 0,
    totalVolumeUsd: 0,
    totalTrades: 0
  });
  const [user, setUser] = useState(null);
  const [wallets, setWallets] = useState([]);
  const [walletError, setWalletError] = useState("");
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletChain, setWalletChain] = useState("BTC");
  const [orderStatus, setOrderStatus] = useState("");
  const [orderError, setOrderError] = useState("");
  const [orderId, setOrderId] = useState("");
  const [offerId, setOfferId] = useState("");
  const [amountFiat, setAmountFiat] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [sellerActionId, setSellerActionId] = useState("");

  useEffect(() => {
    fetch(`${API_URL}/offers?country=${country}&token=${token}`, {
      cache: "no-store",
      credentials: "include"
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed to load offers");
        return data;
      })
      .then((data) => {
        setOffers(data.offers || []);
        setPrice(data.price || null);
        setError("");
      })
      .catch((err) => {
        setOffers([]);
        setPrice(null);
        setError(err.message || "Failed to load offers");
      });
  }, [country, token]);

  useEffect(() => {
    fetch(`${API_URL}/admin/public-catalog`, {
      credentials: "include"
    })
      .then((r) => r.json())
      .then((data) => {
        setAnnouncements(data.announcements || []);
        setMetrics(data.metrics || {});
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/auth/me`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    setWalletLoading(true);
    fetch(`${API_URL}/wallets/addresses`, { credentials: "include" })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed to load wallets");
        return data;
      })
      .then((data) => {
        setWallets(data.addresses || []);
        setWalletError("");
      })
      .catch((err) => {
        setWalletError(err.message || "Failed to load wallets");
      })
      .finally(() => setWalletLoading(false));
  }, [user]);

  function logout() {
    fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      credentials: "include"
    }).finally(() => {
      setUser(null);
    });
  }

  async function createWallet() {
    setWalletLoading(true);
    setWalletError("");
    try {
      const res = await fetch(`${API_URL}/wallets/address`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chain: walletChain })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create address");
      setWallets((prev) => [data.address, ...prev]);
    } catch (err) {
      setWalletError(err.message || "Failed to create address");
    } finally {
      setWalletLoading(false);
    }
  }

  async function createOrder() {
    setOrderError("");
    setOrderStatus("");
    try {
      const res = await fetch(`${API_URL}/orders`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId, amountFiat })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create order");
      setOrderId(data.order.id);
      setOrderStatus(`Order created: ${data.order.id}`);
    } catch (err) {
      setOrderError(err.message || "Failed to create order");
    }
  }

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

  const selectedCountry = COUNTRIES.find((c) => c.code === country);

  return (
    <div className="app">
      {announcements.length > 0 && (
        <div className="announcement-bar">
          <div className="announcement-track">
            {[...announcements, ...announcements].map((item, idx) => (
              <span key={`${item.id}-${idx}`}>{item.message}</span>
            ))}
          </div>
        </div>
      )}
      <nav className="nav">
        <div className="logo">P2P ESCROW</div>
        <div className="nav-links">
          <Link to="/">Market</Link>
          <Link to="/trade">Trade</Link>
          {user && <a href="#wallets">Wallets</a>}
          {user && <a href="#payments">Payments</a>}
          {!user && (
            <>
              <Link to="/signup">Sign up</Link>
              <Link to="/login">Login</Link>
            </>
          )}
        </div>
        <div className="nav-cta">
          {user ? (
            <button className="ghost" onClick={logout}>Logout</button>
          ) : (
            <Link className="cta" to="/signup">Get Started</Link>
          )}
        </div>
      </nav>

      {!user && (
        <header className="hero">
          <div>
            <p className="kicker">P2P Escrow Platform</p>
            <h1>Buy & sell crypto safely with escrow</h1>
            <p className="sub">
              Live offers in Ghana, Nigeria, Kenya, South Africa, and Zambia.
              Online payments only.
            </p>
            <div className="stat-grid">
              <div className="stat-card">
                <p className="muted small">Live Users</p>
                <h3>{metrics.liveUsers ?? 0}</h3>
              </div>
              <div className="stat-card">
                <p className="muted small">Total Users</p>
                <h3>{metrics.totalUsers ?? 0}</h3>
              </div>
              <div className="stat-card">
                <p className="muted small">Total Volume (USD)</p>
                <h3>${Number(metrics.totalVolumeUsd || 0).toFixed(2)}</h3>
              </div>
              <div className="stat-card">
                <p className="muted small">Completed Trades</p>
                <h3>{metrics.totalTrades ?? 0}</h3>
              </div>
            </div>
          </div>
          <div className="card">
            <h3>Market Price</h3>
            <p className="price">
              {price ? `${token} $${price.usd}` : error ? "Price unavailable" : "Loading..."}
            </p>
            <p className="muted">Source: {price?.source || "-"}</p>
            {error && <p className="error">{error}</p>}
          </div>
        </header>
      )}

      {user && (
        <section className="dashboard-head">
          <div>
            <p className="kicker">Dashboard</p>
            <h2>Wallets & Payments</h2>
            <p className="muted">Manage deposits, withdrawals, and payment confirmations.</p>
          </div>
        </section>
      )}

      {!user && (
      <section className="filters" id="market">
        <label>
          Country
          <select value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.currency})
              </option>
            ))}
          </select>
        </label>
        <label>
          Token
          <select value={token} onChange={(e) => setToken(e.target.value)}>
            {TOKENS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </section>
      )}

      {user && (
      <section className="wallets" id="wallets">
        <div className="wallet-card">
          <div className="wallet-head">
            <div>
              <p className="kicker">Custodial Wallets</p>
              <h3>Your Deposit Addresses</h3>
              <p className="muted">One address per chain, derived from secure HD wallet.</p>
            </div>
            <div className="wallet-actions">
              <select value={walletChain} onChange={(e) => setWalletChain(e.target.value)}>
                {TOKENS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button className="cta" onClick={createWallet} disabled={!user || walletLoading}>
                {walletLoading ? "..." : "Create Address"}
              </button>
            </div>
          </div>

          {!user && <p className="muted">Sign in to generate deposit addresses.</p>}
          {walletError && <p className="error">{walletError}</p>}
          {user && wallets.length === 0 && !walletLoading && (
            <p className="muted">No addresses yet.</p>
          )}

          <div className="wallet-list">
            {wallets.map((w) => (
              <div className="wallet-item" key={w.id}>
                <div>
                  <p className="wallet-chain">{w.chain}</p>
                  <p className="wallet-address">{w.address}</p>
                </div>
                <p className="muted small">{w.path}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {user && (
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
              Offer ID
              <input
                value={offerId}
                onChange={(e) => setOfferId(e.target.value)}
                placeholder="offer_id"
              />
            </label>
            <label>
              Amount (Fiat)
              <input
                value={amountFiat}
                onChange={(e) => setAmountFiat(e.target.value)}
                placeholder="1000"
              />
            </label>
          </div>
          <button className="cta" disabled={!user} onClick={createOrder}>
            Create Order
          </button>

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
              <input
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Transaction ref"
              />
            </label>
            <label>
              Note
              <input
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="Extra details"
              />
            </label>
          </div>
          <button className="ghost" disabled={!user} onClick={submitPayment}>
            Submit Payment Proof
          </button>

          <div className="pay-grid">
            <label>
              Seller: Order ID
              <input
                value={sellerActionId}
                onChange={(e) => setSellerActionId(e.target.value)}
                placeholder="order_id"
              />
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
      )}

      {!user && (
        <section className="grid">
          {offers.length === 0 && (
            <div className="empty">No offers found for {selectedCountry?.name}.</div>
          )}
          {offers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} />
          ))}
        </section>
      )}

      {!user && (
        <footer className="footer">
          <div>
            <h4>P2P Escrow Platform</h4>
            <p className="muted">Safe crypto trading with escrow across Africa.</p>
          </div>
          <div className="footer-links">
            <a href="mailto:support@p2pescrow.com">support@p2pescrow.com</a>
            <a href="https://twitter.com" target="_blank" rel="noreferrer">Twitter</a>
            <a href="https://t.me" target="_blank" rel="noreferrer">Telegram</a>
            <a href="https://instagram.com" target="_blank" rel="noreferrer">Instagram</a>
          </div>
        </footer>
      )}
    </div>
  );
}
