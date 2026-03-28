import { useEffect, useState } from "react";
import { apiFetch } from "../api.js";

export default function Home() {
  const [prices, setPrices] = useState({});
  const [tokens, setTokens] = useState(["BTC", "ETH", "USDT", "USDC", "BNB", "SOL"]);
  const [error, setError] = useState("");
  const [announcements, setAnnouncements] = useState([]);
  const [metrics, setMetrics] = useState({
    liveUsers: 0,
    totalUsers: 0,
    totalVolumeUsd: 0,
    totalTrades: 0
  });

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const catalog = await apiFetch("/admin/public-catalog")
          .then((r) => r.json())
          .catch(() => ({ assets: [] }));
        const nextTokens = (catalog.assets || []).map((asset) => asset.symbol);
        const targetTokens = nextTokens.length ? nextTokens : tokens;
        const nextAnnouncements = catalog.announcements || [];
        const nextMetrics = catalog.metrics || {};
        const rows = await Promise.all(
          targetTokens.map((t) =>
            apiFetch(`/offers?token=${t}`, {
              cache: "no-store"
            })
              .then((r) => r.json())
              .then((data) => ({ token: t, price: data.price }))
              .catch(() => ({ token: t, price: null }))
          )
        );
        if (!active) return;
        const next = {};
        rows.forEach((r) => {
          if (r.price?.usd) next[r.token] = r.price.usd;
        });
        setTokens(targetTokens);
        setPrices(next);
        setAnnouncements(nextAnnouncements);
        setMetrics((prev) => ({ ...prev, ...nextMetrics }));
        setError("");
      } catch {
        if (active) setError("Failed to load prices");
      }
    }

    load();
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="home">
      {announcements.length > 0 && (
        <div className="announcement-banner">
          <div className="announcement-track">
            {announcements.concat(announcements).map((item, idx) => (
              <span key={`${item.id}-${idx}`} className="announcement-item">
                {item.message}
              </span>
            ))}
          </div>
        </div>
      )}
      <header className="hero">
        <div>
          <p className="kicker">P2P Escrow Platform</p>
          <h1>Trade crypto locally with secure escrow</h1>
          <p className="sub">
            A marketplace for Ghana, Nigeria, Kenya, South Africa, and Zambia.
            Bank transfer, mobile money, and cards. No cash.
          </p>
        </div>
        <div className="card">
          <h3>Market Prices</h3>
          {error && <p className="error">{error}</p>}
          <div className="price-list">
            {tokens.map((t) => (
              <div key={t} className="price-row">
                <span>{t}</span>
                <span>{prices[t] ? `$${prices[t]}` : "-"}</span>
              </div>
            ))}
          </div>
          <p className="muted">Source: coingecko</p>
        </div>
      </header>

      <section className="stats-grid">
        <div className="stat-card">
          <p className="kicker">Live Users</p>
          <h3>{metrics.liveUsers || 0}</h3>
          <p className="muted small">Active in the last 10 minutes</p>
        </div>
        <div className="stat-card">
          <p className="kicker">Total Users</p>
          <h3>{metrics.totalUsers || 0}</h3>
          <p className="muted small">Registered accounts</p>
        </div>
        <div className="stat-card">
          <p className="kicker">Trading Volume (USD)</p>
          <h3>${Number(metrics.totalVolumeUsd || 0).toFixed(2)}</h3>
          <p className="muted small">{metrics.totalTrades || 0} completed trades</p>
        </div>
      </section>

      <section className="grid">
        <div className="offer">
          <h4>Project Idea</h4>
          <p className="muted">A custodial P2P platform with per-user HD wallets and automated timeouts.</p>
        </div>
        <div className="offer">
          <h4>Markets</h4>
          <p className="muted">Trade BTC, ETH, USDT, USDC, BNB, SOL against local currencies.</p>
        </div>
        <div className="offer">
          <h4>Payments</h4>
          <p className="muted">Support bank transfer, mobile money, and card payments online.</p>
        </div>
      </section>

      <footer className="site-footer">
        <div className="site-footer__top">
          {/* Brand Column */}
          <div className="site-footer__brand">
            <div className="site-footer__logo">P2P ESCROW</div>
            <p className="site-footer__tagline">
              Safe, fast crypto trading with automated escrow protection across Africa and beyond.
            </p>
            <div className="site-footer__socials">
              <a href="https://twitter.com" target="_blank" rel="noreferrer" aria-label="Twitter" className="social-link">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.734-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>
              <a href="https://t.me" target="_blank" rel="noreferrer" aria-label="Telegram" className="social-link">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
              </a>
              <a href="https://instagram.com" target="_blank" rel="noreferrer" aria-label="Instagram" className="social-link">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>
              </a>
              <a href="mailto:support@p2pescrow.com" aria-label="Email" className="social-link">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              </a>
            </div>
          </div>

          {/* Platform Links */}
          <div className="site-footer__col">
            <h5 className="site-footer__col-title">Platform</h5>
            <ul className="site-footer__links">
              <li><a href="/market">Market</a></li>
              <li><a href="/trade">Trade</a></li>
              <li><a href="/wallets">Wallets</a></li>
              <li><a href="/payments">Payments</a></li>
              <li><a href="/dashboard">Dashboard</a></li>
            </ul>
          </div>

          {/* Support Links */}
          <div className="site-footer__col">
            <h5 className="site-footer__col-title">Support</h5>
            <ul className="site-footer__links">
              <li><a href="mailto:support@p2pescrow.com">Help Center</a></li>
              <li><a href="mailto:support@p2pescrow.com">Contact Us</a></li>
              <li><a href="mailto:support@p2pescrow.com">FAQ</a></li>
              <li><a href="mailto:support@p2pescrow.com">Report Issue</a></li>
            </ul>
          </div>

          {/* Legal Links */}
          <div className="site-footer__col">
            <h5 className="site-footer__col-title">Legal</h5>
            <ul className="site-footer__links">
              <li><a href="#">Terms of Service</a></li>
              <li><a href="#">Privacy Policy</a></li>
              <li><a href="#">Cookie Policy</a></li>
              <li><a href="#">AML Policy</a></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="site-footer__bottom">
          <p className="site-footer__copy">© {new Date().getFullYear()} P2P Escrow. All rights reserved.</p>
          <div className="site-footer__badges">
            <span className="footer-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              Escrow Protected
            </span>
            <span className="footer-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              GH · NG · KE · ZA · ZM
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
