import { useState, useEffect } from "react";
import { apiFetch } from "../api.js";

export default function Security() {
  // ── Password change ───────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword]         = useState("");
  const [pwStatus, setPwStatus]               = useState("");
  const [pwError, setPwError]                 = useState("");

  // ── 2FA state ─────────────────────────────────────────────────
  const [tfaEnabled, setTfaEnabled]     = useState(false);
  const [tfaLoading, setTfaLoading]     = useState(true);

  // Setup flow
  const [setupMode, setSetupMode]       = useState(false);   // QR screen open?
  const [qrCode, setQrCode]             = useState("");       // data:image/... URL
  const [manualSecret, setManualSecret] = useState("");       // backup code
  const [enableCode, setEnableCode]     = useState("");       // user input
  const [enableError, setEnableError]   = useState("");
  const [enableLoading, setEnableLoading] = useState(false);

  // Disable flow
  const [disableMode, setDisableMode]   = useState(false);
  const [disableCode, setDisableCode]   = useState("");
  const [disableError, setDisableError] = useState("");
  const [disableLoading, setDisableLoading] = useState(false);

  // ── Load 2FA status on mount ──────────────────────────────────
  useEffect(() => {
    apiFetch("/2fa/status")
      .then((r) => r.json())
      .then((data) => setTfaEnabled(!!data.enabled))
      .catch(() => {})
      .finally(() => setTfaLoading(false));
  }, []);

  // ── Password change ───────────────────────────────────────────
  async function changePassword() {
    setPwStatus("");
    setPwError("");
    try {
      const res = await apiFetch("/auth/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update password");
      setPwStatus("Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setPwError(err.message || "Failed to update password");
    }
  }

  // ── Start 2FA setup — get QR code ────────────────────────────
  async function startSetup() {
    setEnableError("");
    setEnableCode("");
    setEnableLoading(true);
    try {
      const res = await apiFetch("/2fa/setup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Setup failed");
      setQrCode(data.qrCode);
      setManualSecret(data.secret);
      setSetupMode(true);
    } catch (err) {
      setEnableError(err.message || "Setup failed");
    } finally {
      setEnableLoading(false);
    }
  }

  // ── Confirm 2FA enable with TOTP code ────────────────────────
  async function confirmEnable() {
    if (!enableCode.trim()) return setEnableError("Enter the 6-digit code first.");
    setEnableError("");
    setEnableLoading(true);
    try {
      const res = await apiFetch("/2fa/enable", {
        method: "POST",
        body: JSON.stringify({ code: enableCode.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not enable 2FA");
      setTfaEnabled(true);
      setSetupMode(false);
      setQrCode("");
      setManualSecret("");
      setEnableCode("");
    } catch (err) {
      setEnableError(err.message || "Could not enable 2FA");
    } finally {
      setEnableLoading(false);
    }
  }

  // ── Disable 2FA ───────────────────────────────────────────────
  async function confirmDisable() {
    if (!disableCode.trim()) return setDisableError("Enter your current 2FA code first.");
    setDisableError("");
    setDisableLoading(true);
    try {
      const res = await apiFetch("/2fa/disable", {
        method: "POST",
        body: JSON.stringify({ code: disableCode.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not disable 2FA");
      setTfaEnabled(false);
      setDisableMode(false);
      setDisableCode("");
    } catch (err) {
      setDisableError(err.message || "Could not disable 2FA");
    } finally {
      setDisableLoading(false);
    }
  }

  return (
    <section className="wallets">

      {/* ── Password Change ──────────────────────────────────── */}
      <div className="wallet-card">
        <p className="kicker">Security</p>
        <h3>Update Password</h3>
        <div className="pay-grid">
          <label>
            Current Password
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </label>
          <label>
            New Password
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
        </div>
        <button className="cta" onClick={changePassword}>Change Password</button>
        {pwStatus && <p className="muted">{pwStatus}</p>}
        {pwError  && <p className="error">{pwError}</p>}
      </div>

      {/* ── 2FA Google Authenticator ──────────────────────────── */}
      <div className="wallet-card">
        <p className="kicker">Two-Factor Authentication</p>
        <h3>Google Authenticator (2FA)</h3>

        {tfaLoading ? (
          <p className="muted">Loading 2FA status...</p>
        ) : (
          <>
            {/* Status badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <span
                className={`status-badge ${tfaEnabled ? "status-completed" : "status-pending_approval"}`}
              >
                {tfaEnabled ? "✓ Enabled" : "✗ Disabled"}
              </span>
              <p className="muted" style={{ margin: 0 }}>
                {tfaEnabled
                  ? "Withdrawals are protected by 2FA."
                  : "Enable 2FA to protect your withdrawals."}
              </p>
            </div>

            {/* ── SETUP FLOW ──────────────────────────────────── */}
            {!tfaEnabled && !setupMode && (
              <>
                <p className="muted small" style={{ marginBottom: 14 }}>
                  Install <strong>Google Authenticator</strong> or <strong>Authy</strong> on your phone, then click below to scan the QR code.
                </p>
                <button
                  className="cta"
                  onClick={startSetup}
                  disabled={enableLoading}
                >
                  {enableLoading ? "..." : "Enable 2FA"}
                </button>
                {enableError && <p className="error">{enableError}</p>}
              </>
            )}

            {!tfaEnabled && setupMode && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <p className="muted small">
                  <strong>Step 1:</strong> Open Google Authenticator → tap <strong>+</strong> → <strong>Scan QR code</strong>
                </p>

                {/* QR Code */}
                {qrCode && (
                  <div style={{ textAlign: "center" }}>
                    <img
                      src={qrCode}
                      alt="2FA QR Code"
                      style={{
                        width: 200, height: 200,
                        border: "4px solid var(--gold)",
                        borderRadius: 12,
                        background: "#fff",
                        padding: 8
                      }}
                    />
                  </div>
                )}

                {/* Manual entry */}
                {manualSecret && (
                  <div
                    style={{
                      background: "var(--card2)",
                      borderRadius: 10,
                      padding: "12px 16px"
                    }}
                  >
                    <p className="muted small" style={{ margin: "0 0 6px" }}>
                      Can't scan? Enter this key manually:
                    </p>
                    <code
                      style={{
                        display: "block",
                        wordBreak: "break-all",
                        fontSize: 13,
                        color: "var(--gold)",
                        letterSpacing: 2
                      }}
                    >
                      {manualSecret}
                    </code>
                  </div>
                )}

                <p className="muted small">
                  <strong>Step 2:</strong> Enter the 6-digit code shown in your authenticator app:
                </p>

                <label>
                  Verification Code
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={enableCode}
                    onChange={(e) => setEnableCode(e.target.value.replace(/\D/g, ""))}
                    style={{ letterSpacing: 6, fontSize: 20, textAlign: "center" }}
                  />
                </label>

                {enableError && <p className="error">{enableError}</p>}

                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    className="cta"
                    onClick={confirmEnable}
                    disabled={enableLoading || enableCode.length !== 6}
                  >
                    {enableLoading ? "Verifying..." : "Confirm & Enable"}
                  </button>
                  <button
                    className="ghost"
                    onClick={() => { setSetupMode(false); setEnableCode(""); setEnableError(""); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* ── DISABLE FLOW ────────────────────────────────── */}
            {tfaEnabled && !disableMode && (
              <button
                className="ghost"
                onClick={() => { setDisableMode(true); setDisableCode(""); setDisableError(""); }}
              >
                Disable 2FA
              </button>
            )}

            {tfaEnabled && disableMode && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <p className="muted small">
                  Enter your current authenticator code to confirm disabling 2FA:
                </p>
                <label>
                  Current 2FA Code
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ""))}
                    style={{ letterSpacing: 6, fontSize: 20, textAlign: "center" }}
                  />
                </label>
                {disableError && <p className="error">{disableError}</p>}
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    className="cta"
                    onClick={confirmDisable}
                    disabled={disableLoading || disableCode.length !== 6}
                    style={{ background: "var(--red)" }}
                  >
                    {disableLoading ? "Disabling..." : "Confirm Disable"}
                  </button>
                  <button
                    className="ghost"
                    onClick={() => { setDisableMode(false); setDisableCode(""); setDisableError(""); }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </section>
  );
}
