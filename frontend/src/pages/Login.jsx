import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../authContext.jsx";
import { apiFetch } from "../api.js";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [requires2fa, setRequires2fa] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refresh, setSession } = useAuth();

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const body = { email, password };
      if (requires2fa) body.totpCode = totpCode.replace(/\s/g, "");
      const res = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.requires2fa) {
        setRequires2fa(true);
        setError(requires2fa ? "Invalid 2FA code, try again." : "Enter your 2FA code to continue.");
        return;
      }
      if (!res.ok) throw new Error(data.error || "Login failed");
      if (data.token) localStorage.setItem("access_token", data.token);
      if (data.refreshToken) localStorage.setItem("refresh_token", data.refreshToken);
      setSession(data.user || null);
      await refresh();
      navigate(data.user?.role === "admin" ? "/admin" : "/wallets");
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-card wide">
      <h2>Welcome back</h2>
      <p className="muted">Sign in to access your escrow wallet and trades.</p>
      <form className="auth-form" onSubmit={submit}>
        {!requires2fa ? (
          <>
            <label>
              Email
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
            </label>
            <label>
              Password
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
            </label>
          </>
        ) : (
          <label>
            Google Authenticator Code
            <input
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              placeholder="6-digit code"
              maxLength={6}
              inputMode="numeric"
              autoFocus
              required
            />
          </label>
        )}
        <button className="cta" type="submit" disabled={loading}>
          {loading ? "..." : requires2fa ? "Verify" : "Login"}
        </button>
      </form>
      {error && <p className={requires2fa && error.includes("Enter") ? "muted" : "error"}>{error}</p>}
      {!requires2fa && (
        <p className="muted">
          <Link to="/forgot-password">Forgot password?</Link>
        </p>
      )}
      {requires2fa && (
        <button className="ghost" style={{marginTop:"8px"}} onClick={() => { setRequires2fa(false); setTotpCode(""); setError(""); }}>
          Back to login
        </button>
      )}
      <p className="muted">
        No account? <Link to="/signup">Create one</Link>
      </p>
    </div>
  );
}
