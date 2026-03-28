import { API_URL } from "../config.js";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/auth/signup`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed");
      navigate("/verify", { state: { email } });
    } catch (err) {
      setError(err.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-card wide">
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
