import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api.js";

export default function Signup() {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [devToast, setDevToast] = useState(null); // dev OTP toast
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setDevToast(null);
    try {
      const res  = await apiFetch("/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed");

      // ── Dev mode: email না গেলে backend code পাঠায় ──
      if (data.devCode) {
        setDevToast(data.devCode);
        // ৩০ সেকেন্ড পর toast সরিয়ে দাও
        setTimeout(() => setDevToast(null), 30_000);
      }

      navigate("/verify", { state: { email, devCode: data.devCode || null } });
    } catch (err) {
      setError(err.message || "Signup failed");
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
          fontFamily: "monospace", fontSize: 14,
          maxWidth: 320
        }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>📧 Verification Code</div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 8 }}>{devToast}</div>
          <div style={{ fontSize: 12, marginTop: 6, opacity: 0.8 }}>
            Email পাঠানো যায়নি — এই code ব্যবহার করো
          </div>
          <button
            onClick={() => setDevToast(null)}
            style={{ position:"absolute", top:8, right:12, background:"none", border:"none", cursor:"pointer", fontSize:18, color:"#0f1015" }}
          >×</button>
        </div>
      )}

      <h2>Create your account</h2>
      <p className="muted">We will send a 6-digit code to verify your email.</p>
      <form className="auth-form" onSubmit={submit}>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <label>
          Password
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        </label>
        <button className="cta" type="submit" disabled={loading}>
          {loading ? "..." : "Create account"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      <p className="muted">
        Already have an account? <Link to="/login">Login</Link>
      </p>
    </div>
  );
}
