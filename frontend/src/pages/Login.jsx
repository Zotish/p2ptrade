import { API_URL } from "../config.js";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../authContext.jsx";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refresh, setSession } = useAuth();

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
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
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <label>
          Password
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        </label>
        <button className="cta" type="submit" disabled={loading}>
          {loading ? "..." : "Login"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      <p className="muted">
        No account? <Link to="/signup">Create one</Link>
      </p>
    </div>
  );
}
