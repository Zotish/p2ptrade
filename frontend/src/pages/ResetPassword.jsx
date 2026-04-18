import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api.js";

export default function ResetPassword() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    if (newPassword !== confirm) { setError("Passwords do not match"); return; }
    if (newPassword.length < 8) { setError("Password must be at least 8 characters"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ email, code, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");
      setDone(true);
      setTimeout(() => navigate("/login"), 2500);
    } catch (err) {
      setError(err.message || "Reset failed");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="auth-card wide">
        <h2>Password Reset!</h2>
        <p className="muted">Your password has been changed. Redirecting to login...</p>
      </div>
    );
  }

  return (
    <div className="auth-card wide">
      <h2>Reset Password</h2>
      <p className="muted">Enter the code we sent to your email along with your new password.</p>
      <form className="auth-form" onSubmit={submit}>
        <label>Email<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required /></label>
        <label>Reset Code<input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" maxLength={6} inputMode="numeric" required /></label>
        <label>New Password<input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" minLength={8} required /></label>
        <label>Confirm Password<input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" required /></label>
        <button className="cta" type="submit" disabled={loading}>{loading ? "Resetting..." : "Reset Password"}</button>
      </form>
      {error && <p className="error">{error}</p>}
      <p className="muted"><Link to="/login">Back to login</Link></p>
    </div>
  );
}
