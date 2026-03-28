import { useState } from "react";
import { apiFetch } from "../api.js";

export default function Security() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function changePassword() {
    setStatus("");
    setError("");
    try {
      const res = await apiFetch("/auth/password", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update password");
      setStatus("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setError(err.message || "Failed to update password");
    }
  }

  return (
    <section className="wallets">
      <div className="wallet-card">
        <p className="kicker">Security</p>
        <h3>Update Password</h3>
        <div className="pay-grid">
          <label>
            Current Password
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </label>
          <label>
            New Password
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </label>
        </div>
        <button className="cta" onClick={changePassword}>Change Password</button>
        {status && <p className="muted">{status}</p>}
        {error && <p className="error">{error}</p>}
      </div>
    </section>
  );
}
