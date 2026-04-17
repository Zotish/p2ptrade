import { useEffect, useState } from "react";
import { useAuth } from "../authContext.jsx";
import { HistoryTable } from "../components/HistoryTable.jsx";
import { apiFetch } from "../api.js";

export default function Wallets() {
  const { user, scanTick, loading } = useAuth();
  const [wallets, setWallets] = useState([]);
  const [walletError, setWalletError] = useState("");
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletChain, setWalletChain] = useState("BTC");
  const [depositAssets, setDepositAssets] = useState([]);
  const [depositSelection, setDepositSelection] = useState("");
  const [withdrawAssets, setWithdrawAssets] = useState([]);
  const [balances, setBalances] = useState({});
  const [withdrawAsset, setWithdrawAsset] = useState("BTC");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawTo, setWithdrawTo] = useState("");
  const [withdrawStatus, setWithdrawStatus] = useState("");
  const [feeEstimate, setFeeEstimate]       = useState(null);   // { fee, feeAsset, balance, maxWithdrawable, feeSameAsAsset }
  const [feeLoading, setFeeLoading]         = useState(false);
  const [deposits, setDeposits] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [totpEnabled, setTotpEnabled]       = useState(false);
  const [withdrawTotpCode, setWithdrawTotpCode] = useState("");

  // Whitelist state
  const [whitelist, setWhitelist]           = useState([]);
  const [wlChain, setWlChain]               = useState("BTC");
  const [wlAddress, setWlAddress]           = useState("");
  const [wlLabel, setWlLabel]               = useState("");
  const [wlTotpCode, setWlTotpCode]         = useState("");
  const [wlStatus, setWlStatus]             = useState("");
  const [wlLoading, setWlLoading]           = useState(false);

  const selectedWithdrawAsset = withdrawAssets.find((item) => item.symbol === withdrawAsset);
  const pendingWithdrawals = withdrawals.filter((item) => item.status === "pending_approval");
  const sentWithdrawals = withdrawals.filter((item) => item.status === "sent");

  // ── Fetch 2FA status + whitelist ────────────────────────────────
  useEffect(() => {
    if (!user) return;
    apiFetch("/2fa/status")
      .then((r) => r.json())
      .then((data) => setTotpEnabled(!!data.enabled))
      .catch(() => {});
    loadWhitelist();
  }, [user]);

  function loadWhitelist() {
    apiFetch("/wallets/whitelist")
      .then((r) => r.json())
      .then((data) => setWhitelist(Array.isArray(data.whitelist) ? data.whitelist : []))
      .catch(() => {});
  }

  async function addToWhitelist() {
    if (!wlChain || !wlAddress.trim()) return setWlStatus("Chain and address required.");
    setWlLoading(true);
    setWlStatus("");
    try {
      const body = { chain: wlChain, address: wlAddress.trim(), label: wlLabel.trim() };
      if (totpEnabled) body.totpCode = wlTotpCode.trim();
      const res = await apiFetch("/wallets/whitelist", { method: "POST", body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add");
      setWlAddress(""); setWlLabel(""); setWlTotpCode("");
      loadWhitelist();
      setWlStatus("Address added to whitelist.");
    } catch (err) {
      setWlStatus(err.message || "Failed to add address");
    } finally {
      setWlLoading(false);
    }
  }

  async function removeFromWhitelist(id) {
    setWlStatus("");
    try {
      const body = totpEnabled ? { totpCode: prompt("Enter your 2FA code to remove:") } : {};
      const res = await apiFetch(`/wallets/whitelist/${id}`, { method: "DELETE", body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove");
      loadWhitelist();
    } catch (err) {
      setWlStatus(err.message || "Failed to remove");
    }
  }

  useEffect(() => {
    apiFetch("/wallets/catalog")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed to load wallet catalog");
        return data;
      })
      .then((data) => {
        const depositAssetList = data.depositAssets || [];
        const withdrawalList = data.withdrawalAssets || [];
        setDepositAssets(Array.isArray(depositAssetList) ? depositAssetList : []);
        setWithdrawAssets(Array.isArray(withdrawalList) ? withdrawalList : []);
        if (depositAssetList.length) {
          setDepositSelection((prev) =>
            depositAssetList.some((item) => item.id === prev) ? prev : depositAssetList[0].id
          );
          setWalletChain((prev) => {
            const found = depositAssetList.find((item) => item.chain_code === prev);
            return found ? prev : depositAssetList[0].chain_code || prev;
          });
        }
        if (withdrawalList.length) {
          setWithdrawAsset((prev) =>
            withdrawalList.some((item) => item.symbol === prev) ? prev : withdrawalList[0].symbol
          );
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    setWalletLoading(true);
    apiFetch("/wallets/addresses")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed to load wallets");
        return data;
      })
      .then((data) => {
        setWallets(Array.isArray(data.addresses) ? data.addresses : []);
        setWalletError("");
      })
      .catch((err) => {
        setWalletError(err.message || "Failed to load wallets");
      })
      .finally(() => setWalletLoading(false));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let active = true;

    async function loadWalletData() {
      try {
        const [balancesRes, depositsRes, withdrawalsRes] = await Promise.all([
          apiFetch("/wallets/balances"),
          apiFetch("/wallets/deposits"),
          apiFetch("/wallets/withdrawals")
        ]);

        const [balancesData, depositsData, withdrawalsData] = await Promise.all([
          balancesRes.json(),
          depositsRes.json(),
          withdrawalsRes.json()
        ]);

        if (!active) return;
        if (balancesRes.ok) setBalances(balancesData.balances && typeof balancesData.balances === "object" && !Array.isArray(balancesData.balances) ? balancesData.balances : {});
        if (depositsRes.ok) setDeposits(Array.isArray(depositsData.deposits) ? depositsData.deposits : []);
        if (withdrawalsRes.ok) setWithdrawals(Array.isArray(withdrawalsData.withdrawals) ? withdrawalsData.withdrawals : []);
      } catch {
        // ignore transient polling failures
      }
    }

    loadWalletData();
    const timer = setInterval(loadWalletData, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [user, scanTick]);

  async function createWallet() {
    setWalletLoading(true);
    setWalletError("");
    try {
      const res = await apiFetch("/wallets/address", {
        method: "POST",
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

  async function fetchFeeEstimate(asset) {
    setFeeLoading(true);
    setFeeEstimate(null);
    try {
      const res = await apiFetch(
        `/wallets/withdraw/estimate?asset=${encodeURIComponent(asset)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Estimate failed");
      setFeeEstimate(data);
      // auto-fill max withdrawable amount
      setWithdrawAmount(String(data.maxWithdrawable));
    } catch (err) {
      setWithdrawStatus(err.message || "Could not estimate fee");
    } finally {
      setFeeLoading(false);
    }
  }

  async function submitWithdraw() {
    setWithdrawStatus("");
    if (totpEnabled && !withdrawTotpCode.trim()) {
      setWithdrawStatus("2FA code required. Open Google Authenticator and enter the code.");
      return;
    }
    try {
      const body = {
        chain: selectedWithdrawAsset?.chain_code || "BNB",
        asset: withdrawAsset,
        toAddress: withdrawTo,
        amount: Number(withdrawAmount)
      };
      if (totpEnabled) body.totpCode = withdrawTotpCode.trim();

      const res = await apiFetch("/wallets/withdraw", {
        method: "POST",
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Withdrawal failed");
      setWithdrawStatus("Withdrawal request submitted. Waiting for admin approval.");
      setWithdrawTotpCode("");
    } catch (err) {
      setWithdrawStatus(err.message || "Withdrawal failed");
    }
  }


  if (loading) {
    return (
      <section className="wallets" id="wallets">
        <div className="wallet-card">
          <h3>Wallets</h3>
          <p className="muted">Loading wallet session...</p>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="wallets" id="wallets">
        <div className="wallet-card">
          <h3>Wallets</h3>
          <p className="muted">Sign in to view and create deposit addresses.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="wallets" id="wallets">
      <div className="wallet-card">
        <div className="wallet-head">
          <div>
            <p className="kicker">Custodial Wallets</p>
            <h3>Your Deposit Addresses</h3>
            <p className="muted">One address per chain, derived from secure HD wallet.</p>
          </div>
          <div className="wallet-actions">
            <select
              value={depositSelection}
              onChange={(e) => {
                const selected = depositAssets.find((asset) => asset.id === e.target.value);
                setDepositSelection(e.target.value);
                if (selected?.chain_code) {
                  setWalletChain(selected.chain_code);
                }
              }}
            >
              {(Array.isArray(depositAssets) ? depositAssets : []).map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.symbol} ({asset.chain_name || asset.chain_code})
                </option>
              ))}
            </select>
            <button className="cta" onClick={createWallet} disabled={walletLoading}>
              {walletLoading ? "..." : "Create Address"}
            </button>
          </div>
        </div>

        <p className="muted small">
          Tokens use the same deposit address as their chain. For example, USDT (BNB) uses your BNB address.
        </p>

        {walletError && <p className="error">{walletError}</p>}
        {wallets.length === 0 && !walletLoading && (
          <p className="muted">No addresses yet.</p>
        )}

        <div className="wallet-list">
          {(Array.isArray(wallets) ? wallets : []).map((w) => (
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

     

      <div className="wallet-card">
        <h3>Balances</h3>
        <div className="market-table">
          <div className="market-row market-head">
            <span>Asset</span>
            <span>Balance</span>
            <span></span>
          </div>
          {(Array.isArray(withdrawAssets) ? withdrawAssets : []).map((asset) => (
            <div className="market-row" key={asset.id}>
              <span>{asset.symbol}</span>
              <span>{balances[asset.symbol] || 0}</span>
              <span></span>
            </div>
          ))}
        </div>
      </div>

      <div className="wallet-card">
        <div className="stats-grid">
          <div className="stat-box">
            <span className="status-badge status-pending_approval">{pendingWithdrawals.length}</span>
            <p className="wallet-chain">Pending Approval</p>
            <p className="muted small">Awaiting admin review before broadcast.</p>
          </div>
          <div className="stat-box">
            <span className="status-badge status-sent">{sentWithdrawals.length}</span>
            <p className="wallet-chain">Sent</p>
            <p className="muted small">Approved and broadcast on-chain.</p>
          </div>
        </div>
      </div>

      <div className="wallet-card">
        <h3>Withdraw</h3>
        <div className="pay-grid">

          {/* Asset selector */}
          <label>
            Asset
            <select
              value={withdrawAsset}
              onChange={(e) => {
                setWithdrawAsset(e.target.value);
                setWithdrawAmount("");
                setFeeEstimate(null);
                setWithdrawStatus("");
              }}
            >
              {(Array.isArray(withdrawAssets) ? withdrawAssets : []).map((asset) => (
                <option key={asset.id} value={asset.symbol}>
                  {asset.symbol}
                </option>
              ))}
            </select>
          </label>

          {/* Amount + Max button */}
          <label>
            <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Amount</span>
              <button
                className="max-btn"
                type="button"
                disabled={feeLoading}
                onClick={() => fetchFeeEstimate(withdrawAsset)}
              >
                {feeLoading ? "…" : "MAX"}
              </button>
            </span>
            <input
              type="number"
              min="0"
              step="any"
              placeholder="0.00"
              value={withdrawAmount}
              onChange={(e) => {
                setWithdrawAmount(e.target.value);
                setFeeEstimate(null); // reset estimate on manual edit
              }}
            />
          </label>

          {/* Fee info box */}
          {feeEstimate && (
            <div className="fee-estimate-box">
              <div className="fee-row">
                <span>Available balance</span>
                <strong>{feeEstimate.balance} {withdrawAsset}</strong>
              </div>
              <div className="fee-row">
                <span>Network fee</span>
                <strong>~{feeEstimate.fee} {feeEstimate.feeAsset}</strong>
              </div>
              {!feeEstimate.feeSameAsAsset && (
                <div className="fee-row">
                  <span>{feeEstimate.feeAsset} balance (for fee)</span>
                  <strong style={{ color: feeEstimate.feeAssetBalance >= feeEstimate.fee ? "var(--green)" : "var(--red)" }}>
                    {feeEstimate.feeAssetBalance} {feeEstimate.feeAsset}
                  </strong>
                </div>
              )}
              <div className="fee-row fee-max-row">
                <span>Max withdrawable</span>
                <strong style={{ color: "var(--gold)" }}>
                  {feeEstimate.maxWithdrawable} {withdrawAsset}
                </strong>
              </div>
            </div>
          )}

          {/* To Address */}
          <label>
            To Address
            {/* Whitelist shortcut — whitelisted addresses for this chain */}
            {whitelist.filter((w) => w.chain === (selectedWithdrawAsset?.chain_code || withdrawAsset)).length > 0 && (
              <select
                style={{ marginBottom: 6 }}
                value={withdrawTo}
                onChange={(e) => setWithdrawTo(e.target.value)}
              >
                <option value="">— Select from whitelist or type below —</option>
                {whitelist
                  .filter((w) => w.chain === (selectedWithdrawAsset?.chain_code || withdrawAsset))
                  .map((w) => (
                    <option key={w.id} value={w.address}>
                      {w.label ? `${w.label} — ` : ""}{w.address.slice(0, 16)}...{w.address.slice(-8)}
                    </option>
                  ))}
              </select>
            )}
            <input
              placeholder="Paste destination wallet address"
              value={withdrawTo}
              onChange={(e) => setWithdrawTo(e.target.value)}
            />
          </label>

          {/* 2FA Code — only shown when 2FA is enabled */}
          {totpEnabled && (
            <label>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                🔐 Google Authenticator Code
                <span className="status-badge status-completed" style={{ fontSize: 11 }}>2FA ON</span>
              </span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="6-digit code"
                value={withdrawTotpCode}
                onChange={(e) => setWithdrawTotpCode(e.target.value.replace(/\D/g, ""))}
                style={{ letterSpacing: 6, fontSize: 20, textAlign: "center" }}
                autoComplete="one-time-code"
              />
            </label>
          )}
        </div>

        <button
          className="cta"
          onClick={submitWithdraw}
          disabled={!withdrawAmount || !withdrawTo || (totpEnabled && withdrawTotpCode.length !== 6)}
        >
          Withdraw
        </button>
        {withdrawStatus && (
          <p className={withdrawStatus.toLowerCase().includes("submitted") ? "muted" : "error"}>
            {withdrawStatus}
          </p>
        )}
        <p className="muted small">All withdrawals require admin approval before on-chain broadcast.</p>
      </div>

      {/* ── Withdrawal Address Whitelist ──────────────────────── */}
      <div className="wallet-card">
        <p className="kicker">Security</p>
        <h3>Trusted Withdrawal Addresses</h3>
        <p className="muted small">Save your frequently-used addresses here. They'll appear as quick-select options when withdrawing.</p>

        {/* Existing whitelist */}
        {whitelist.length > 0 && (
          <div className="wallet-list" style={{ marginBottom: 16 }}>
            {whitelist.map((w) => (
              <div className="wallet-item" key={w.id} style={{ justifyContent: "space-between" }}>
                <div>
                  <p className="wallet-chain">{w.chain}{w.label ? ` — ${w.label}` : ""}</p>
                  <p className="wallet-address" style={{ fontSize: 12 }}>{w.address}</p>
                </div>
                <button
                  className="ghost"
                  style={{ fontSize: 12, padding: "4px 10px", color: "var(--red)" }}
                  onClick={() => removeFromWhitelist(w.id)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new address */}
        <div className="pay-grid">
          <label>
            Chain
            <select value={wlChain} onChange={(e) => setWlChain(e.target.value)}>
              {(Array.isArray(withdrawAssets) ? withdrawAssets : []).map((a) => (
                <option key={a.chain_code} value={a.chain_code}>{a.chain_code}</option>
              ))}
            </select>
          </label>
          <label>
            Address
            <input
              placeholder="Wallet address to whitelist"
              value={wlAddress}
              onChange={(e) => setWlAddress(e.target.value)}
            />
          </label>
          <label>
            Label (optional)
            <input
              placeholder="e.g. My Binance"
              value={wlLabel}
              onChange={(e) => setWlLabel(e.target.value)}
            />
          </label>
          {totpEnabled && (
            <label>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                🔐 2FA Code
                <span className="status-badge status-completed" style={{ fontSize: 11 }}>Required</span>
              </span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={wlTotpCode}
                onChange={(e) => setWlTotpCode(e.target.value.replace(/\D/g, ""))}
                style={{ letterSpacing: 6, fontSize: 18, textAlign: "center" }}
              />
            </label>
          )}
        </div>
        <button
          className="cta"
          onClick={addToWhitelist}
          disabled={wlLoading || !wlAddress.trim() || (totpEnabled && wlTotpCode.length !== 6)}
        >
          {wlLoading ? "Adding..." : "Add to Whitelist"}
        </button>
        {wlStatus && (
          <p className={wlStatus.includes("added") ? "muted" : "error"}>{wlStatus}</p>
        )}
      </div>

      <HistoryTable
        title="Deposits"
        columns={["chain", "amount", "status", "txid"]}
        rows={deposits}
      />

      <HistoryTable
        title="Withdrawals"
        columns={["asset", "amount", "status", "txid"]}
        rows={withdrawals}
      />
    </section>
    
  );
}
