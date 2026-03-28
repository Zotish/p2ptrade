import { API_URL } from "../config.js";
import { useEffect, useState } from "react";
import { useAuth } from "../authContext.jsx";

// Chat history viewer for admin disputes
function DisputeChat({ orderId }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (open) { setOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:4000/orders/${orderId}/messages`, { credentials: "include" });
      const data = await res.json();
      setMsgs(data.messages || []);
      setOpen(true);
    } catch { setMsgs([]); setOpen(true); }
    finally { setLoading(false); }
  }

  return (
    <div className="dispute-chat-section">
      <button className="ghost" onClick={load} style={{fontSize:13}}>
        {loading ? "Loading…" : open ? "▲ Hide Chat History" : "💬 View Chat History"}
      </button>
      {open && (
        <div className="dispute-chat-log">
          {msgs.length === 0 && <p className="muted small">No messages in this order.</p>}
          {msgs.map((m) => (
            <div key={m.id} className="dispute-chat-msg">
              <span className="muted small">{m.sender_id?.slice(0,8)} · {new Date(m.created_at).toLocaleTimeString()}</span>
              <p>{m.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const EMPTY_CHAIN = {
  code: "",
  name: "",
  kind: "evm",
  network: "testnet",
  rpcUrl: "",
  rpcUrls: "",
  isActive: true
};

const EMPTY_ASSET = {
  symbol: "",
  name: "",
  chainCode: "BNB",
  isNative: false,
  contractAddress: "",
  coingeckoId: "",
  decimals: 18,
  isActive: true,
  depositsEnabled: true,
  withdrawalsEnabled: true,
  feeAddress: "",
  feeBps: 30
};

const EMPTY_FIAT = {
  code: "",
  name: "",
  symbol: "",
  isActive: true,
  countryCode: "",
  countryName: ""
};

const EMPTY_COUNTRY = {
  code: "",
  name: "",
  fiatCode: "",
  isActive: true
};

const EMPTY_TREASURY_WITHDRAW = {
  asset: "",
  amount: "",
  toAddress: ""
};

export default function Admin() {
  const { user, loading } = useAuth();
  const [chains, setChains] = useState([]);
  const [assets, setAssets] = useState([]);
  const [users, setUsers] = useState([]);
  const [pendingWithdrawals, setPendingWithdrawals] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [chainForm, setChainForm] = useState(EMPTY_CHAIN);
  const [assetForm, setAssetForm] = useState(EMPTY_ASSET);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState(null);
  const [health, setHealth] = useState([]);
  const [feeEdits, setFeeEdits] = useState({});
  const [fiats, setFiats] = useState([]);
  const [fiatForm, setFiatForm] = useState(EMPTY_FIAT);
  const [countries, setCountries] = useState([]);
  const [countryForm, setCountryForm] = useState(EMPTY_COUNTRY);
  const [paymentProviders, setPaymentProviders] = useState([]);
  const [providerForm, setProviderForm] = useState({
    id: null,
    countryCode: "",
    method: "bank_transfer",
    name: "",
    details: "",
    isActive: true
  });
  const [treasury, setTreasury] = useState({ onchain: [], platformFees: [], userFunds: [] });
  const [treasuryLoading, setTreasuryLoading] = useState(false);
  const [treasuryUpdatedAt, setTreasuryUpdatedAt] = useState("");
  const [treasuryWithdraw, setTreasuryWithdraw] = useState(EMPTY_TREASURY_WITHDRAW);
  const [treasuryWithdrawStatus, setTreasuryWithdrawStatus] = useState("");
  const [announcements, setAnnouncements] = useState([]);
  const [announcementForm, setAnnouncementForm] = useState({
    message: "",
    startsAt: "",
    endsAt: "",
    isActive: true
  });

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    loadCatalog();
  }, [user]);

  async function loadCatalog() {
    try {
      const res = await fetch(`${API_URL}/admin/catalog`, {
        credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load admin data");
      setChains(data.chains || []);
      setAssets(data.assets || []);
      setUsers(data.users || []);
      setPendingWithdrawals(data.pendingWithdrawals || []);
      setFiats(data.fiats || []);
      setCountries(data.countries || []);
      setPaymentProviders(data.paymentProviders || []);
      setAnnouncements(data.announcements || []);
      setError("");
      loadHealth();
      loadTreasury();
      loadDisputes();
    } catch (err) {
      setError(err.message || "Failed to load admin data");
    }
  }

  async function loadDisputes() {
    try {
      const res = await fetch(`${API_URL}/admin/disputes`, { credentials: "include" });
      const data = await res.json();
      if (res.ok) setDisputes(data.disputes || []);
    } catch { /* ignore */ }
  }

  async function resolveDispute(orderId, action, note) {
    try {
      const res = await fetch(`http://localhost:4000/admin/disputes/${orderId}/${action}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setDisputes((prev) => prev.filter((d) => d.id !== orderId));
      setStatus(`Dispute ${orderId.slice(0, 8)} resolved — ${action === "release" ? "Crypto released to buyer" : "Crypto refunded to seller"}`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadHealth() {
    try {
      const res = await fetch(`${API_URL}/admin/health`, {
        credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load health data");
      setHealth(data.statuses || []);
    } catch (err) {
      setError(err.message || "Failed to load health data");
    }
  }

  async function loadTreasury() {
    setTreasuryLoading(true);
    try {
      const res = await fetch(`${API_URL}/admin/treasury`, {
        credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load treasury data");
      setTreasury({
        onchain: data.onchain || [],
        platformFees: data.platformFees || [],
        userFunds: data.userFunds || [],
        treasuryAddresses: data.treasuryAddresses || []
      });
      setTreasuryUpdatedAt(new Date().toLocaleString());
    } catch (err) {
      setError(err.message || "Failed to load treasury data");
    } finally {
      setTreasuryLoading(false);
    }
  }

  async function submitTreasuryWithdraw(e) {
    e.preventDefault();
    setTreasuryWithdrawStatus("");
    try {
      const res = await fetch(`${API_URL}/admin/treasury/withdraw`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asset: treasuryWithdraw.asset,
          amount: Number(treasuryWithdraw.amount),
          toAddress: treasuryWithdraw.toAddress
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Treasury withdrawal failed");
      setTreasuryWithdrawStatus(`Sent. Tx: ${data.result?.txid || "ok"}`);
      setTreasuryWithdraw(EMPTY_TREASURY_WITHDRAW);
      loadTreasury();
    } catch (err) {
      setTreasuryWithdrawStatus(err.message || "Treasury withdrawal failed");
    }
  }

  async function submitChain(e) {
    e.preventDefault();
    setStatus("");
    try {
      const res = await fetch(`${API_URL}/admin/chains`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chainForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add chain");
      setChains((prev) => [data.chain, ...prev]);
      setChainForm(EMPTY_CHAIN);
      setStatus("Chain added.");
    } catch (err) {
      setError(err.message || "Failed to add chain");
    }
  }

  async function submitAsset(e) {
    e.preventDefault();
    setStatus("");
    try {
      const res = await fetch(`${API_URL}/admin/assets`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assetForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add asset");
      setAssets((prev) => [data.asset, ...prev]);
      setAssetForm(EMPTY_ASSET);
      setStatus("Asset added.");
    } catch (err) {
      setError(err.message || "Failed to add asset");
    }
  }

  async function submitFiat(e) {
    e.preventDefault();
    setStatus("");
    try {
      const res = await fetch(`${API_URL}/admin/fiats`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fiatForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add fiat");
      setFiats((prev) => [data.fiat, ...prev]);
      setFiatForm(EMPTY_FIAT);
      setStatus("Fiat added.");
    } catch (err) {
      setError(err.message || "Failed to add fiat");
    }
  }

  async function submitCountry(e) {
    e.preventDefault();
    setStatus("");
    try {
      const res = await fetch(`${API_URL}/admin/countries`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(countryForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add country");
      setCountries((prev) => [data.country, ...prev]);
      setCountryForm(EMPTY_COUNTRY);
      setStatus("Country added.");
    } catch (err) {
      setError(err.message || "Failed to add country");
    }
  }

  async function submitProvider(e) {
    e.preventDefault();
    setStatus("");
    try {
      const payload = {
        countryCode: providerForm.countryCode,
        method: providerForm.method,
        name: providerForm.name,
        details: providerForm.details ? providerForm.details : null,
        isActive: providerForm.isActive
      };
      const endpoint = providerForm.id
        ? `http://localhost:4000/admin/payment-providers/${providerForm.id}`
        : `${API_URL}/admin/payment-providers`;
      const res = await fetch(endpoint, {
        method: providerForm.id ? "PATCH" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save provider");
      if (providerForm.id) {
        setPaymentProviders((prev) => prev.map((p) => (p.id === providerForm.id ? data.provider : p)));
      } else {
        setPaymentProviders((prev) => [data.provider, ...prev]);
      }
      setProviderForm({ id: null, countryCode: "", method: "bank_transfer", name: "", details: "", isActive: true });
      setStatus("Payment provider saved.");
    } catch (err) {
      setError(err.message || "Failed to save provider");
    }
  }

  async function toggleProvider(item) {
    try {
      const res = await fetch(`http://localhost:4000/admin/payment-providers/${item.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !item.is_active })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update provider");
      setPaymentProviders((prev) => prev.map((p) => (p.id === item.id ? data.provider : p)));
    } catch (err) {
      setError(err.message || "Failed to update provider");
    }
  }

  async function deleteProvider(id) {
    try {
      const res = await fetch(`http://localhost:4000/admin/payment-providers/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete provider");
      setPaymentProviders((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError(err.message || "Failed to delete provider");
    }
  }

  function editProvider(item) {
    setProviderForm({
      id: item.id,
      countryCode: item.country_code,
      method: item.method,
      name: item.name,
      details: item.details ? JSON.stringify(item.details) : "",
      isActive: item.is_active
    });
  }

  async function submitAnnouncement(e) {
    e.preventDefault();
    setStatus("");
    try {
      const res = await fetch(`${API_URL}/admin/announcements`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(announcementForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add announcement");
      setAnnouncements((prev) => [data.announcement, ...prev]);
      setAnnouncementForm({ message: "", startsAt: "", endsAt: "", isActive: true });
      setStatus("Announcement added.");
    } catch (err) {
      setError(err.message || "Failed to add announcement");
    }
  }

  async function toggleAnnouncement(item) {
    try {
      const res = await fetch(`http://localhost:4000/admin/announcements/${item.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !item.is_active })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update announcement");
      setAnnouncements((prev) => prev.map((a) => (a.id === item.id ? data.announcement : a)));
    } catch (err) {
      setError(err.message || "Failed to update announcement");
    }
  }

  async function deleteAnnouncement(id) {
    try {
      const res = await fetch(`http://localhost:4000/admin/announcements/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete announcement");
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(err.message || "Failed to delete announcement");
    }
  }

  async function toggleCountry(country) {
    try {
      const res = await fetch(`http://localhost:4000/admin/countries/${country.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !country.is_active })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update country");
      setCountries((prev) => prev.map((item) => (item.id === country.id ? data.country : item)));
    } catch (err) {
      setError(err.message || "Failed to update country");
    }
  }

  async function toggleFiat(fiat) {
    try {
      const res = await fetch(`http://localhost:4000/admin/fiats/${fiat.id}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !fiat.is_active })
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update fiat");
      setFiats((prev) => prev.map((item) => (item.id === fiat.id ? data.fiat : item)));
    } catch (err) {
      setError(err.message || "Failed to update fiat");
    }
  }

  useEffect(() => {
    if (!assets.length) return;
    setFeeEdits((prev) => {
      const next = { ...prev };
      for (const asset of assets) {
        if (!next[asset.id]) {
          next[asset.id] = {
            feeAddress: asset.fee_address || "",
            feeBps: asset.fee_bps ?? 30
          };
        }
      }
      return next;
    });
  }, [assets]);

  async function toggleChain(chain) {
    await patchChain(chain.id, { isActive: !chain.is_active });
  }

  async function toggleAsset(asset, field) {
    const body =
      field === "is_active"
        ? { isActive: !asset.is_active }
        : field === "deposits_enabled"
          ? { depositsEnabled: !asset.deposits_enabled }
          : { withdrawalsEnabled: !asset.withdrawals_enabled };
    try {
      const res = await fetch(`http://localhost:4000/admin/assets/${asset.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update asset");
      setAssets((prev) => prev.map((item) => (item.id === asset.id ? data.asset : item)));
    } catch (err) {
      setError(err.message || "Failed to update asset");
    }
  }

  async function saveAssetFees(asset) {
    const edit = feeEdits[asset.id];
    if (!edit) return;
    try {
      const res = await fetch(`http://localhost:4000/admin/assets/${asset.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeAddress: edit.feeAddress,
          feeBps: edit.feeBps
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update fee settings");
      setAssets((prev) => prev.map((item) => (item.id === asset.id ? data.asset : item)));
      setStatus(`Fee settings updated for ${asset.symbol}.`);
    } catch (err) {
      setError(err.message || "Failed to update fee settings");
    }
  }

  async function patchChain(id, body) {
    try {
      const res = await fetch(`http://localhost:4000/admin/chains/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update chain");
      setChains((prev) => prev.map((item) => (item.id === id ? data.chain : item)));
    } catch (err) {
      setError(err.message || "Failed to update chain");
    }
  }

  async function changeUserRole(targetUser, role) {
    try {
      const res = await fetch(`http://localhost:4000/admin/users/${targetUser.id}/role`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update user role");
      setUsers((prev) => prev.map((item) => (item.id === targetUser.id ? data.user : item)));
      setStatus(`Updated ${targetUser.email} to ${role}.`);
    } catch (err) {
      setError(err.message || "Failed to update user role");
    }
  }

  async function handleWithdrawal(id, action) {
    try {
      const res = await fetch(`http://localhost:4000/admin/withdrawals/${id}/${action}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: action === "reject" ? "Rejected by admin panel" : undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed to ${action} withdrawal`);
      setPendingWithdrawals((prev) => prev.filter((item) => item.id !== id));
      setSelectedWithdrawal((prev) => (prev?.id === id ? null : prev));
      setStatus(`Withdrawal ${action}d.`);
    } catch (err) {
      setError(err.message || `Failed to ${action} withdrawal`);
    }
  }

  if (loading) {
    return (
      <section className="wallets">
        <div className="wallet-card"><p className="muted">Loading admin panel...</p></div>
      </section>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <section className="wallets">
        <div className="wallet-card">
          <h3>Admin Panel</h3>
          <p className="muted">Admin access required.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="wallets">
      <div className="wallet-card">
        <p className="kicker">Admin</p>
        <h3>Platform Control Panel</h3>
        <p className="muted">
          Add chain and token metadata here. New blockchain engines still need backend watcher and withdrawal support.
        </p>
        {error && <p className="error">{error}</p>}
        {status && <p className="muted">{status}</p>}
      </div>

      <div className="wallet-card">
        <div className="wallet-head">
          <div>
            <p className="kicker">Treasury</p>
            <h3>On-chain Balances, User Funds, Platform Fees</h3>
            <p className="muted small">
              On-chain balances are summed across all deposit addresses. User funds are internal ledger totals.
            </p>
            {treasuryUpdatedAt && <p className="muted small">Last refreshed: {treasuryUpdatedAt}</p>}
          </div>
          <div className="wallet-actions">
            <button className="ghost" onClick={loadTreasury} disabled={treasuryLoading}>
              {treasuryLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="market-table">
          <div className="market-row market-head">
            <span>Asset</span>
            <span>Chain</span>
            <span>On-chain Total</span>
            <span>Addresses</span>
            <span>Status</span>
          </div>
          {treasury.onchain.map((row) => (
            <div className="market-row" key={`${row.asset}-${row.chain}`}>
              <span>{row.asset}</span>
              <span>{row.chain}</span>
              <span>{row.error ? "-" : Number(row.total || 0).toFixed(6)}</span>
              <span>{row.addressCount || 0}</span>
              <span className={row.error ? "error" : "muted"}>{row.error || "ok"}</span>
            </div>
          ))}
          {!treasury.onchain.length && (
            <div className="market-row">
              <span className="muted">No on-chain data yet.</span>
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
          )}
        </div>

        <div className="market-table">
          <div className="market-row market-head">
            <span>User Funds (Ledger)</span>
            <span>Total</span>
            <span></span>
          </div>
          {treasury.userFunds.map((row) => (
            <div className="market-row" key={`userfund-${row.asset}`}>
              <span>{row.asset}</span>
              <span>{Number(row.total || 0).toFixed(6)}</span>
              <span></span>
            </div>
          ))}
          {!treasury.userFunds.length && (
            <div className="market-row">
              <span className="muted">No user funds yet.</span>
              <span></span>
              <span></span>
            </div>
          )}
        </div>

        <div className="market-table">
          <div className="market-row market-head">
            <span>Platform Fees</span>
            <span>Total</span>
            <span></span>
          </div>
          {treasury.platformFees.map((row) => (
            <div className="market-row" key={`fee-${row.asset}`}>
              <span>{row.asset}</span>
              <span>{Number(row.amount || 0).toFixed(6)}</span>
              <span></span>
            </div>
          ))}
          {!treasury.platformFees.length && (
            <div className="market-row">
              <span className="muted">No platform fees yet.</span>
              <span></span>
              <span></span>
            </div>
          )}
        </div>

        <div className="wallet-card" style={{ marginTop: "18px" }}>
          <h3>Treasury Withdrawal</h3>
          <p className="muted small">
            Withdraw from platform fee ledger. Make sure the treasury address is funded on-chain.
          </p>
          <form className="pay-grid" onSubmit={submitTreasuryWithdraw}>
            <label>
              Asset
              <select
                value={treasuryWithdraw.asset}
                onChange={(e) =>
                  setTreasuryWithdraw((s) => ({ ...s, asset: e.target.value }))
                }
              >
                <option value="">Select asset</option>
                {assets.map((asset) => (
                  <option key={asset.id} value={asset.symbol}>
                    {asset.symbol}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Amount
              <input
                type="number"
                step="any"
                value={treasuryWithdraw.amount}
                onChange={(e) =>
                  setTreasuryWithdraw((s) => ({ ...s, amount: e.target.value }))
                }
              />
            </label>
            <label>
              To Address
              <input
                value={treasuryWithdraw.toAddress}
                onChange={(e) =>
                  setTreasuryWithdraw((s) => ({ ...s, toAddress: e.target.value }))
                }
              />
            </label>
            <button className="cta" type="submit">
              Withdraw
            </button>
          </form>
          {treasuryWithdrawStatus && (
            <p className={treasuryWithdrawStatus.startsWith("Sent") ? "muted" : "error"}>
              {treasuryWithdrawStatus}
            </p>
          )}
          {treasuryWithdraw.asset && (
            <p className="muted small">
              Available fees:{" "}
              {(
                treasury.platformFees.find((row) => row.asset === treasuryWithdraw.asset)?.amount ||
                0
              ).toFixed(6)}
            </p>
          )}
        </div>

        {treasury.treasuryAddresses?.length > 0 && (
          <div className="market-table">
            <div className="market-row market-head">
              <span>Treasury Address</span>
              <span>Chain</span>
              <span>Kind</span>
            </div>
            {treasury.treasuryAddresses.map((row) => (
              <div className="market-row" key={`treasury-${row.chain}`}>
                <span>{row.address || row.error || "-"}</span>
                <span>{row.chain}</span>
                <span>{row.kind}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="wallet-card">
        <h3>Add Chain</h3>
        <p className="muted small">
          `code`: short network key like `BTC`, `BNB`, `ETH`, `SOL`.
          `kind`: `evm`, `utxo`, `solana`, `tron`, `ripple`, or `auto` (detect from RPC).
        </p>
        <form className="pay-grid" onSubmit={submitChain}>
          <label>
            Code
            <input value={chainForm.code} onChange={(e) => setChainForm((s) => ({ ...s, code: e.target.value.toUpperCase() }))} />
          </label>
          <label>
            Name
            <input value={chainForm.name} onChange={(e) => setChainForm((s) => ({ ...s, name: e.target.value }))} />
          </label>
          <label>
            Kind
            <select value={chainForm.kind} onChange={(e) => setChainForm((s) => ({ ...s, kind: e.target.value }))}>
              <option value="auto">Auto (detect)</option>
              <option value="evm">EVM</option>
              <option value="utxo">UTXO</option>
              <option value="solana">Solana</option>
              <option value="tron">Tron</option>
              <option value="ripple">Ripple</option>
            </select>
          </label>
          <label>
            Network
            <input value={chainForm.network} onChange={(e) => setChainForm((s) => ({ ...s, network: e.target.value }))} />
          </label>
          <label>
            RPC URL
            <input value={chainForm.rpcUrl} onChange={(e) => setChainForm((s) => ({ ...s, rpcUrl: e.target.value }))} />
          </label>
          <label>
            RPC Fallback List
            <input
              value={chainForm.rpcUrls}
              onChange={(e) => setChainForm((s) => ({ ...s, rpcUrls: e.target.value }))}
              placeholder="url1,url2,url3"
            />
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={chainForm.isActive} onChange={(e) => setChainForm((s) => ({ ...s, isActive: e.target.checked }))} />
            Active
          </label>
          <button className="cta" type="submit">Add Chain</button>
        </form>
      </div>

      <div className="wallet-card">
        <h3>Add Asset</h3>
        <form className="pay-grid" onSubmit={submitAsset}>
          <label>
            Symbol
            <input value={assetForm.symbol} onChange={(e) => setAssetForm((s) => ({ ...s, symbol: e.target.value.toUpperCase() }))} />
          </label>
          <label>
            Name
            <input value={assetForm.name} onChange={(e) => setAssetForm((s) => ({ ...s, name: e.target.value }))} />
          </label>
          <label>
            Chain
            <select value={assetForm.chainCode} onChange={(e) => setAssetForm((s) => ({ ...s, chainCode: e.target.value }))}>
              {chains.map((chain) => (
                <option key={chain.id} value={chain.code}>{chain.code}</option>
              ))}
            </select>
          </label>
          <label>
            Decimals
            <input value={assetForm.decimals} onChange={(e) => setAssetForm((s) => ({ ...s, decimals: e.target.value }))} />
          </label>
          <label>
            Contract Address
            <input value={assetForm.contractAddress} onChange={(e) => setAssetForm((s) => ({ ...s, contractAddress: e.target.value }))} />
          </label>
          <label>
            CoinGecko ID
            <input value={assetForm.coingeckoId} onChange={(e) => setAssetForm((s) => ({ ...s, coingeckoId: e.target.value }))} />
          </label>
          <label>
            Fee Address
            <input value={assetForm.feeAddress} onChange={(e) => setAssetForm((s) => ({ ...s, feeAddress: e.target.value }))} />
          </label>
          <label>
            Fee BPS
            <input value={assetForm.feeBps} onChange={(e) => setAssetForm((s) => ({ ...s, feeBps: e.target.value }))} />
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={assetForm.isNative} onChange={(e) => setAssetForm((s) => ({ ...s, isNative: e.target.checked }))} />
            Native Asset
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={assetForm.isActive} onChange={(e) => setAssetForm((s) => ({ ...s, isActive: e.target.checked }))} />
            Active
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={assetForm.depositsEnabled} onChange={(e) => setAssetForm((s) => ({ ...s, depositsEnabled: e.target.checked }))} />
            Deposits Enabled
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={assetForm.withdrawalsEnabled} onChange={(e) => setAssetForm((s) => ({ ...s, withdrawalsEnabled: e.target.checked }))} />
            Withdrawals Enabled
          </label>
          <button className="cta" type="submit">Add Asset</button>
        </form>
      </div>

      <div className="wallet-card">
        <h3>Announcements</h3>
        <form className="pay-grid" onSubmit={submitAnnouncement}>
          <label>
            Message
            <input
              value={announcementForm.message}
              onChange={(e) =>
                setAnnouncementForm((s) => ({ ...s, message: e.target.value }))
              }
              placeholder="Maintenance, promo, or updates..."
            />
          </label>
          <label>
            Starts At (optional)
            <input
              type="datetime-local"
              value={announcementForm.startsAt}
              onChange={(e) =>
                setAnnouncementForm((s) => ({ ...s, startsAt: e.target.value }))
              }
            />
          </label>
          <label>
            Ends At (optional)
            <input
              type="datetime-local"
              value={announcementForm.endsAt}
              onChange={(e) =>
                setAnnouncementForm((s) => ({ ...s, endsAt: e.target.value }))
              }
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={announcementForm.isActive}
              onChange={(e) =>
                setAnnouncementForm((s) => ({ ...s, isActive: e.target.checked }))
              }
            />
            Active
          </label>
          <button className="cta" type="submit">Add Announcement</button>
        </form>
        <div className="market-table">
          <div className="market-row market-head">
            <span>Message</span>
            <span>Window</span>
            <span>Status</span>
            <span></span>
          </div>
          {announcements.map((item) => (
            <div className="market-row" key={item.id}>
              <span>{item.message}</span>
              <span className="muted small">
                {item.starts_at || "-"} → {item.ends_at || "-"}
              </span>
              <span>{item.is_active ? "active" : "paused"}</span>
              <span className="inline-actions">
                <button className="ghost" onClick={() => toggleAnnouncement(item)}>
                  {item.is_active ? "Disable" : "Enable"}
                </button>
                <button className="ghost" onClick={() => deleteAnnouncement(item.id)}>
                  Delete
                </button>
              </span>
            </div>
          ))}
          {announcements.length === 0 && (
            <div className="market-row">
              <span className="muted">No announcements yet.</span>
              <span></span>
              <span></span>
              <span></span>
            </div>
          )}
        </div>
      </div>

      <div className="wallet-card">
        <h3>Payment Providers</h3>
        <p className="muted small">
          Add per-country payment providers for bank transfer, mobile money, and cards.
        </p>
        <form className="pay-grid" onSubmit={submitProvider}>
          <label>
            Country
            <select
              value={providerForm.countryCode}
              onChange={(e) => setProviderForm((s) => ({ ...s, countryCode: e.target.value }))}
            >
              <option value="">Select country</option>
              {countries.map((c) => (
                <option key={c.id} value={c.code}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </label>
          <label>
            Method
            <select
              value={providerForm.method}
              onChange={(e) => setProviderForm((s) => ({ ...s, method: e.target.value }))}
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="card">Card</option>
            </select>
          </label>
          <label>
            Provider Name
            <input
              value={providerForm.name}
              onChange={(e) => setProviderForm((s) => ({ ...s, name: e.target.value }))}
              placeholder="e.g., MTN MoMo / Airtel / Visa"
            />
          </label>
          <label>
            Details (optional JSON/text)
            <input
              value={providerForm.details}
              onChange={(e) => setProviderForm((s) => ({ ...s, details: e.target.value }))}
              placeholder='{"note":"Support number"}'
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={providerForm.isActive}
              onChange={(e) => setProviderForm((s) => ({ ...s, isActive: e.target.checked }))}
            />
            Active
          </label>
          <button className="cta" type="submit">
            {providerForm.id ? "Update Provider" : "Add Provider"}
          </button>
        </form>

        <div className="market-table">
          <div className="market-row market-head">
            <span>Provider</span>
            <span>Country</span>
            <span>Method</span>
            <span>Status</span>
            <span></span>
          </div>
          {paymentProviders.map((item) => (
            <div className="market-row" key={item.id}>
              <span>{item.name}</span>
              <span>{item.country_code}</span>
              <span>{item.method.replace("_", " ")}</span>
              <span>{item.is_active ? "active" : "paused"}</span>
              <span className="inline-actions">
                <button className="ghost" onClick={() => editProvider(item)}>
                  Edit
                </button>
                <button className="ghost" onClick={() => toggleProvider(item)}>
                  {item.is_active ? "Disable" : "Enable"}
                </button>
                <button className="ghost" onClick={() => deleteProvider(item.id)}>
                  Delete
                </button>
              </span>
            </div>
          ))}
          {paymentProviders.length === 0 && (
            <div className="market-row">
              <span className="muted">No payment providers yet.</span>
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
          )}
        </div>
      </div>

      <div className="wallet-card">
        <h3>Add Local Currency</h3>
        <form className="pay-grid" onSubmit={submitFiat}>
          <label>
            Code
            <input value={fiatForm.code} onChange={(e) => setFiatForm((s) => ({ ...s, code: e.target.value.toUpperCase() }))} />
          </label>
          <label>
            Name
            <input value={fiatForm.name} onChange={(e) => setFiatForm((s) => ({ ...s, name: e.target.value }))} />
          </label>
          <label>
            Symbol
            <input value={fiatForm.symbol} onChange={(e) => setFiatForm((s) => ({ ...s, symbol: e.target.value }))} />
          </label>
          <label>
            Country Code (optional)
            <input value={fiatForm.countryCode} onChange={(e) => setFiatForm((s) => ({ ...s, countryCode: e.target.value.toUpperCase() }))} />
          </label>
          <label>
            Country Name (optional)
            <input value={fiatForm.countryName} onChange={(e) => setFiatForm((s) => ({ ...s, countryName: e.target.value }))} />
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={fiatForm.isActive} onChange={(e) => setFiatForm((s) => ({ ...s, isActive: e.target.checked }))} />
            Active
          </label>
          <button className="cta" type="submit">Add Local Currency</button>
        </form>
      </div>

      <div className="wallet-card">
        <h3>Add Country</h3>
        <form className="pay-grid" onSubmit={submitCountry}>
          <label>
            Code
            <input value={countryForm.code} onChange={(e) => setCountryForm((s) => ({ ...s, code: e.target.value.toUpperCase() }))} />
          </label>
          <label>
            Name
            <input value={countryForm.name} onChange={(e) => setCountryForm((s) => ({ ...s, name: e.target.value }))} />
          </label>
          <label>
            Fiat Code
            <select value={countryForm.fiatCode} onChange={(e) => setCountryForm((s) => ({ ...s, fiatCode: e.target.value }))}>
              {fiats.map((f) => (
                <option key={f.code} value={f.code}>{f.code} - {f.name}</option>
              ))}
            </select>
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={countryForm.isActive} onChange={(e) => setCountryForm((s) => ({ ...s, isActive: e.target.checked }))} />
            Active
          </label>
          <button className="cta" type="submit">Add Country</button>
        </form>
      </div>

      <div className="wallet-card">
        <h3>Chains</h3>
        <div className="market-table">
          <div className="market-row market-head">
            <span>Code</span>
            <span>Network</span>
            <span>Status</span>
          </div>
          {chains.map((chain) => (
            <div className="market-row" key={chain.id}>
              <span>{chain.code} - {chain.name}</span>
              <span>{chain.kind} / {chain.network}</span>
              <span>
                <button className="ghost" onClick={() => toggleChain(chain)}>
                  {chain.is_active ? "Disable" : "Enable"}
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="wallet-card">
        <div className="wallet-head">
          <h3>RPC Health</h3>
          <button className="ghost" onClick={loadHealth}>Refresh</button>
        </div>
        <div className="market-table">
          <div className="market-row market-head">
            <span>Chain</span>
            <span>Endpoint</span>
            <span>Status</span>
          </div>
          {health.map((item) =>
            item.checks.map((check, idx) => (
              <div className="market-row" key={`${item.code}-${idx}`}>
                <span>{item.code} / {item.kind}</span>
                <span className="wallet-address">{check.url}</span>
                <span>
                  <span className={`status-badge ${check.ok ? "status-confirmed" : "status-failed"}`}>
                    {check.ok ? "healthy" : "failed"}
                  </span>
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="wallet-card">
        <h3>Assets</h3>
        <div className="market-table">
          <div className="market-row market-head">
            <span>Asset</span>
            <span>Chain</span>
            <span>Fees</span>
            <span>Controls</span>
          </div>
          {assets.map((asset) => (
            <div className="market-row" key={asset.id}>
              <span>{asset.symbol} - {asset.name}</span>
              <span>{asset.chain_code}</span>
              <span className="fee-cell">
                <input
                  className="fee-input"
                  placeholder="Fee address"
                  value={feeEdits[asset.id]?.feeAddress ?? asset.fee_address ?? ""}
                  onChange={(e) =>
                    setFeeEdits((prev) => ({
                      ...prev,
                      [asset.id]: {
                        feeAddress: e.target.value,
                        feeBps: prev[asset.id]?.feeBps ?? asset.fee_bps ?? 30
                      }
                    }))
                  }
                />
                <input
                  className="fee-input small-input"
                  placeholder="BPS"
                  value={feeEdits[asset.id]?.feeBps ?? asset.fee_bps ?? 30}
                  onChange={(e) =>
                    setFeeEdits((prev) => ({
                      ...prev,
                      [asset.id]: {
                        feeAddress: prev[asset.id]?.feeAddress ?? asset.fee_address ?? "",
                        feeBps: e.target.value
                      }
                    }))
                  }
                />
                <button className="ghost" onClick={() => saveAssetFees(asset)}>Save</button>
              </span>
              <span className="admin-actions">
                <button className="ghost" onClick={() => toggleAsset(asset, "is_active")}>
                  {asset.is_active ? "Disable" : "Enable"}
                </button>
                <button className="ghost" onClick={() => toggleAsset(asset, "deposits_enabled")}>
                  {asset.deposits_enabled ? "Deposits On" : "Deposits Off"}
                </button>
                <button className="ghost" onClick={() => toggleAsset(asset, "withdrawals_enabled")}>
                  {asset.withdrawals_enabled ? "Withdrawals On" : "Withdrawals Off"}
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="wallet-card">
        <h3>Local Currencies</h3>
        <div className="market-table">
          <div className="market-row market-head">
            <span>Code</span>
            <span>Name</span>
            <span>Status</span>
          </div>
          {fiats.map((fiat) => (
            <div className="market-row" key={fiat.id}>
              <span>{fiat.code}</span>
              <span>{fiat.name}</span>
              <span>
                <button className="ghost" onClick={() => toggleFiat(fiat)}>
                  {fiat.is_active ? "Disable" : "Enable"}
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="wallet-card">
        <h3>Countries</h3>
        <div className="market-table">
          <div className="market-row market-head">
            <span>Code</span>
            <span>Name</span>
            <span>Fiat</span>
            <span>Status</span>
          </div>
          {countries.map((country) => (
            <div className="market-row" key={country.id}>
              <span>{country.code}</span>
              <span>{country.name}</span>
              <span>{country.fiat_code}</span>
              <span>
                <button className="ghost" onClick={() => toggleCountry(country)}>
                  {country.is_active ? "Disable" : "Enable"}
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Disputes ── */}
      <div className="wallet-card">
        <div className="wallet-head">
          <div>
            <p className="kicker">Dispute Management</p>
            <h3>Active Disputes {disputes.length > 0 && <span className="dispute-badge">{disputes.length}</span>}</h3>
            <p className="muted">Review evidence and decide who gets the crypto.</p>
          </div>
          <button className="ghost" onClick={loadDisputes}>Refresh</button>
        </div>

        {disputes.length === 0 && <p className="muted">No active disputes. ✅</p>}

        {disputes.map((d) => (
          <div key={d.id} className="dispute-admin-card">
            <div className="dispute-admin-top">
              <div>
                <strong>{d.offer_token} / {d.offer_fiat}</strong>
                <span className="muted small"> · #{d.id.slice(0, 8)}</span>
              </div>
              <span className="status-badge status-disputed">disputed</span>
            </div>

            <div className="dispute-admin-grid">
              <div className="dispute-admin-party">
                <p className="seller-order-label">👤 Buyer</p>
                <p><strong>{d.buyer_name || d.buyer_email}</strong></p>
                {d.buyer_email && <p className="muted small">{d.buyer_email}</p>}
                {d.buyer_phone && <p className="muted small">{d.buyer_phone}</p>}
              </div>
              <div className="dispute-admin-party">
                <p className="seller-order-label">🏪 Seller</p>
                <p><strong>{d.seller_name || d.seller_email}</strong></p>
                {d.seller_email && <p className="muted small">{d.seller_email}</p>}
              </div>
            </div>

            <div className="seller-order-amounts">
              <div><p className="muted small">Fiat</p><strong>{d.amount_fiat} {d.offer_fiat}</strong></div>
              <div><p className="muted small">Crypto</p><strong>{d.amount_token} {d.offer_token}</strong></div>
            </div>

            {d.pay_method && (
              <div className="seller-order-section seller-order-proof">
                <p className="seller-order-label">💳 Payment Proof</p>
                <div className="seller-order-info-grid">
                  <div><span className="muted small">Method</span><strong>{d.pay_method?.replace(/_/g, " ")}</strong></div>
                  {d.pay_reference && <div><span className="muted small">Reference</span><strong className="ref-code">{d.pay_reference}</strong></div>}
                  {d.pay_note && <div style={{gridColumn:"1/-1"}}><span className="muted small">Note</span><strong>{d.pay_note}</strong></div>}
                </div>
              </div>
            )}

            {d.dispute_reason && (
              <div className="seller-order-section">
                <p className="seller-order-label">📝 Buyer's Dispute Reason</p>
                <p className="muted">{d.dispute_reason}</p>
              </div>
            )}

            {/* Chat History */}
            <DisputeChat orderId={d.id} />

            <div className="dispute-admin-actions">
              <button className="cta" onClick={() => {
                const note = window.prompt("Admin note (optional):");
                if (note !== null) resolveDispute(d.id, "release", note);
              }}>✅ Release to Buyer</button>
              <button className="ghost danger" onClick={() => {
                const note = window.prompt("Admin note (optional):");
                if (note !== null) resolveDispute(d.id, "refund", note);
              }}>🔁 Refund to Seller</button>
            </div>
          </div>
        ))}
      </div>

      <div className="wallet-card">
        <h3>Pending Withdrawals</h3>
        <div className="market-table">
          <div className="market-row market-head">
            <span>User</span>
            <span>Request</span>
            <span>Action</span>
          </div>
          {pendingWithdrawals.length === 0 && (
            <div className="market-row">
              <span>No pending withdrawals</span>
              <span></span>
              <span></span>
            </div>
          )}
          {pendingWithdrawals.map((item) => (
            <div className="market-row" key={item.id}>
              <span>{item.user_email}</span>
              <span>{item.asset} {item.amount} to {item.to_address}</span>
              <span className="admin-actions">
                <button className="ghost" onClick={() => setSelectedWithdrawal(item)}>
                  View
                </button>
                <button className="ghost" onClick={() => handleWithdrawal(item.id, "approve")}>
                  Approve
                </button>
                <button className="ghost" onClick={() => handleWithdrawal(item.id, "reject")}>
                  Reject
                </button>
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="wallet-card">
        <h3>Users</h3>
        <div className="market-table">
          <div className="market-row market-head">
            <span>User</span>
            <span>Status</span>
            <span>Role</span>
          </div>
          {users.map((item) => (
            <div className="market-row" key={item.id} style={item.is_frozen ? {background:"rgba(224,82,82,0.08)"} : {}}>
              <span>
                {item.email}
                {item.is_frozen && <span className="status-badge status-disputed" style={{marginLeft:8}}>🔒 Frozen</span>}
              </span>
              <span>{item.is_verified ? "✅ Verified" : "Unverified"} · {item.role}</span>
              <span className="admin-actions" style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <button className="ghost" onClick={() => changeUserRole(item, item.role === "admin" ? "user" : "admin")}>
                  Make {item.role === "admin" ? "User" : "Admin"}
                </button>
                {item.is_frozen ? (
                  <button className="ghost" style={{borderColor:"var(--green)",color:"var(--green)"}}
                    onClick={async () => {
                      await fetch(`http://localhost:4000/admin/users/${item.id}/unfreeze`, {method:"POST",credentials:"include"});
                      setUsers(prev => prev.map(u => u.id === item.id ? {...u, is_frozen: 0} : u));
                      setStatus(`${item.email} unfrozen`);
                    }}>🔓 Unfreeze</button>
                ) : (
                  <button className="ghost danger"
                    onClick={async () => {
                      const reason = window.prompt(`Reason to freeze ${item.email}:`);
                      if (!reason) return;
                      await fetch(`http://localhost:4000/admin/users/${item.id}/freeze`, {
                        method:"POST", credentials:"include",
                        headers:{"Content-Type":"application/json"},
                        body: JSON.stringify({reason})
                      });
                      setUsers(prev => prev.map(u => u.id === item.id ? {...u, is_frozen: 1, freeze_reason: reason} : u));
                      setStatus(`${item.email} frozen: ${reason}`);
                    }}>🔒 Freeze</button>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {selectedWithdrawal && (
        <div className="modal-backdrop" onClick={() => setSelectedWithdrawal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="wallet-head">
              <div>
                <p className="kicker">Withdrawal Request</p>
                <h3>{selectedWithdrawal.asset} {selectedWithdrawal.amount}</h3>
              </div>
              <button className="ghost" onClick={() => setSelectedWithdrawal(null)}>Close</button>
            </div>
            <div className="pay-grid">
              <div>
                <p className="muted small">User</p>
                <p>{selectedWithdrawal.user_email}</p>
              </div>
              <div>
                <p className="muted small">Chain</p>
                <p>{selectedWithdrawal.chain}</p>
              </div>
              <div>
                <p className="muted small">Status</p>
                <p><span className={`status-badge status-${selectedWithdrawal.status}`}>{selectedWithdrawal.status}</span></p>
              </div>
              <div>
                <p className="muted small">Created</p>
                <p>{selectedWithdrawal.created_at}</p>
              </div>
            </div>
            <div className="wallet-card compact-card">
              <p className="muted small">Destination</p>
              <p className="wallet-address">{selectedWithdrawal.to_address}</p>
            </div>
            <div className="admin-actions">
              <button className="cta" onClick={() => handleWithdrawal(selectedWithdrawal.id, "approve")}>
                Approve and Send
              </button>
              <button className="ghost" onClick={() => handleWithdrawal(selectedWithdrawal.id, "reject")}>
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
