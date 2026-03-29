import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../authContext.jsx";
import { apiFetch } from "../api.js";

export default function Verify() {
  const [email, setEmail]     = useState("");
  const [code, setCode]       = useState("");
  const [error, setError]     = useState("");
  const [loading, setLoading] = useState(false);
  const navigate  = useNavigate();
  const location  = useLocation();
  const { refresh, setSession } = useAuth();

  const stateEmail   = location.state?.email;
  const [devToast, setDevToast] = useState(location.state?.devCode || null);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res  = await apiFetch("/auth/verify", {
        method: "POST",
        body: JSON.stringify({ email: email || stateEmail, code })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");
      if (data.token)        localStorage.setItem("access_token",  data.token);
      if (data.refreshToken) localStorage.setItem("refresh_token", data.refreshToken);
      setSession(data.user || null);
      await refresh();
      navigate(data.user?.role === "admin" ? "/admin" : "/wallets");
    } catch (err) {
      setError(err.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setLoading(true);
    setError("");
    setDevToast(null);
    try {
      const res  = await apiFetch("/auth/resend", {
        method: "POST",
        body: JSON.stringify({ email: email || stateEmail })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resend code");
      if (data.devCode) setDevToast(data.devCode);
    } catch (err) {
      setError(err.message || "Failed to resend code");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-card wide">

      {/* ── Dev OTP Toast ── */}
      {devToast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 9999,
          background: "#f4b740", color: "#0f1015",
          borderRadius: 12, padding: "16px 24px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          fontFamily: "monospace", minWidth: 260
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13 }}>
            📧 Email যায়নি — এই code ব্যবহার করো
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 10 }}>
            {devToast}
          </div>
          <div style={{ fontSize: 11, marginTop: 6, opacity: 0.7 }}>
            নিচের box-এ paste করো
          </div>
          <button
            onClick={() => { setCode(devToast); setDevToast(null); }}
            style={{
              marginTop: 10, background: "#0f1015", color: "#f4b740",
              border: "none", borderRadius: 8, padding: "6px 14px",
              cursor: "pointer", fontWeight: 700, fontSize: 13, width: "100%"
            }}
          >
            ✅ Auto-fill করো
          </button>
          <button
            onClick={() => setDevToast(null)}
            style={{
              position: "absolute", top: 8, right: 12,
              background: "none", border: "none",
              cursor: "pointer", fontSize: 18, color: "#0f1015"
            }}
          >×</button>
        </div>
      )}

      <h2>Verify your email</h2>
      <p className="muted">Enter the 6-digit code sent to your email.</p>
      <form className="auth-form" onSubmit={submit}>
        <label>
          Email
          <input
            value={email || stateEmail || ""}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
          />
        </label>
        <label>
          Verification Code
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            type="text"
            placeholder="6-digit code"
            required
          />
        </label>
        <button className="cta" type="submit" disabled={loading}>
          {loading ? "..." : "Verify"}
        </button>
      </form>
      <button className="ghost" disabled={loading} onClick={resend}>
        Resend Code
      </button>
      {error && <p className="error">{error}</p>}
      <p className="muted">
        Back to <Link to="/login">Login</Link>
      </p>
    </div>
  );
}
