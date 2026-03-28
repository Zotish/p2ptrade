import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../authContext.jsx";
import { apiFetch } from "../api.js";

export default function Verify() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh, setSession } = useAuth();

  const stateEmail = location.state?.email;

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/auth/verify", {
        method: "POST",
        body: JSON.stringify({ email: email || stateEmail, code })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");
      if (data.token) localStorage.setItem("access_token", data.token);
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

  return (
    <div className="auth-card wide">
      <h2>Verify your email</h2>
      <p className="muted">Enter the 6-digit code sent to your email.</p>
      <form className="auth-form" onSubmit={submit}>
        <label>
          Email
          <input value={email || stateEmail || ""} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <label>
          Verification Code
          <input value={code} onChange={(e) => setCode(e.target.value)} type="text" required />
        </label>
        <button className="cta" type="submit" disabled={loading}>
          {loading ? "..." : "Verify"}
        </button>
      </form>
      <button
        className="ghost"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setError("");
          try {
            const res = await apiFetch("/auth/resend", {
              method: "POST",
              body: JSON.stringify({ email: email || stateEmail })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to resend code");
          } catch (err) {
            setError(err.message || "Failed to resend code");
          } finally {
            setLoading(false);
          }
        }}
      >
        Resend Code
      </button>
      {error && <p className="error">{error}</p>}
      <p className="muted">
        Back to <Link to="/login">Login</Link>
      </p>
    </div>
  );
}
