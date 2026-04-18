import { useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api.js";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");
      setSent(true);
    } catch (err) {
      setError(err.message || "Request failed");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="auth-card wide">
        <h2>Check your email</h2>
        <p className="muted">We've sent a 6-digit reset code to <strong>{email}</strong>. It expires in 15 minutes.</p>
        <Link to="/reset-password" className="cta" style={{display:"block",textAlign:"center",marginTop:"16px"}}>
          Enter reset code
        </Link>
        <p className="muted" style={{marginTop:"12px"}}><Link to="/login">Back to login</Link></p>
      </div>
    );
  }

  return (
    <div className="auth-card wide">
      <h2>Forgot Password</h2>
      <p className="muted">Enter your email and we'll send you a reset code.</p>
      <form className="auth-form" onSubmit={submit}>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <button className="cta" type="submit" disabled={loading}>
          {loading ? "Sending..." : "Send Reset Code"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      <p className="muted"><Link to="/login">Back to login</Link></p>
    </div>
  );
}
