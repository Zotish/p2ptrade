import { API_URL } from "../config.js";
import { useEffect, useState } from "react";
import { useAuth } from "../authContext.jsx";
import { HistoryTable } from "../components/HistoryTable.jsx";

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

  const selectedWithdrawAsset = withdrawAssets.find((item) => item.symbol === withdrawAsset);
  const pendingWithdrawals = withdrawals.filter((item) => item.status === "pending_approval");
  const sentWithdrawals = withdrawals.filter((item) => item.status === "sent");

  useEffect(() => {
    fetch(`${API_URL}/wallets/catalog`, {
      credentials: "include"
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed to load wallet catalog");
        return data;
      })
      .then((data) => {
        const depositAssetList = data.depositAssets || [];
        const withdrawalList = data.withdrawalAssets || [];
        setDepositAssets(depositAssetList);
        setWithdrawAssets(withdrawalList);
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
          setCreditAsset((prev) =>
            withdrawalList.some((item) => item.symbol === prev) ? prev : withdrawalList[0].symbol
          );
        }
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

  useEffect(() => {
    if (!user) return;
    let active = true;

    async function loadWalletData() {
      try {
        const [balancesRes, depositsRes, withdrawalsRes] = await Promise.all([
          fetch(`${API_URL}/wallets/balances`, { credentials: "include" }),
          fetch(`${API_URL}/wallets/deposits`, { credentials: "include" }),
          fetch(`${API_URL}/wallets/withdrawals`, { credentials: "include" })
        ]);

        const [balancesData, depositsData, withdrawalsData] = await Promise.all([
          balancesRes.json(),
          depositsRes.json(),
          withdrawalsRes.json()
        ]);

        if (!active) return;
        if (balancesRes.ok) setBalances(balancesData.balances || {});
        if (depositsRes.ok) setDeposits(depositsData.deposits || []);
        if (withdrawalsRes.ok) setWithdrawals(withdrawalsData.withdrawals || []);
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

  async function fetchFeeEstimate(asset) {
    setFeeLoading(true);
    setFeeEstimate(null);
    try {
      const res = await fetch(
        `${API_URL}/wallets/withdraw/estimate?asset=${encodeURIComponent(asset)}`,
        { credentials: "include" }
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
    try {
      const res = await fetch(`${API_URL}/wallets/withdraw`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chain: selectedWithdrawAsset?.chain_code || "BNB",
          asset: withdrawAsset,
          toAddress: withdrawTo,
          amount: Number(withdrawAmount)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Withdrawal failed");
      setWithdrawStatus("Withdrawal request submitted. Waiting for admin approval.");
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
              {depositAssets.map((asset) => (
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

     

      <div className="wallet-card">
        <h3>Balances</h3>
        <div className="market-table">
          <div className="market-row market-head">
            <span>Asset</span>
            <span>Balance</span>
            <span></span>
          </div>
          {withdrawAssets.map((asset) => (
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
              {withdrawAssets.map((asset) => (
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
            <input
              placeholder="Paste destination wallet address"
              value={withdrawTo}
              onChange={(e) => setWithdrawTo(e.target.value)}
            />
          </label>
        </div>

        <button
          className="cta"
          onClick={submitWithdraw}
          disabled={!withdrawAmount || !withdrawTo}
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
