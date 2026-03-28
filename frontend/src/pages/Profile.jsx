import { API_URL } from "../config.js";
import { useAuth } from "../authContext.jsx";
import { useEffect, useState } from "react";

export default function Profile() {
  const { user, refresh } = useAuth();
  const [handle, setHandle] = useState(user?.handle || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [profileName, setProfileName] = useState(user?.profile_name || "");
  const [profileImageUrl, setProfileImageUrl] = useState(user?.profile_image_url || "");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setHandle(user.handle || "");
    setPhone(user.phone || "");
    setProfileName(user.profile_name || "");
    setProfileImageUrl(user.profile_image_url || "");
  }, [user]);

  async function saveProfile() {
    setStatus("");
    setError("");
    try {
      const res = await fetch(`${API_URL}/auth/profile`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, phone, profileName, profileImageUrl })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update profile");
      setStatus("Profile updated.");
    } catch (err) {
      setError(err.message || "Failed to update profile");
    }
  }

  async function uploadProfileImage(file) {
    if (!file) return;
    setUploading(true);
    setStatus("");
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_URL}/auth/upload/profile`, {
        method: "POST",
        credentials: "include",
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setProfileImageUrl(data.url || "");
      setStatus("Profile image uploaded.");
      await refresh();
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function getInitials() {
    const base = profileName || handle || user?.email || "U";
    const parts = String(base).trim().split(" ");
    const first = parts[0]?.[0] || "U";
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
    return `${first}${last}`.toUpperCase();
  }

  return (
    <section className="wallets">
      <div className="wallet-card">
        <p className="kicker">Profile</p>
        <h3>Your Account</h3>
        <div className="profile-summary">
          <div className="avatar">
            {profileImageUrl ? (
              <img src={profileImageUrl} alt="Profile" />
            ) : (
              <span>{getInitials()}</span>
            )}
          </div>
          <div>
            <p className="profile-name">{profileName || handle || "User"}</p>
            <p className="muted small">User ID: {user?.id || "-"}</p>
            <p className="muted small">{user?.email}</p>
          </div>
        </div>
      </div>

      <div className="wallet-card">
        <p className="kicker">Profile</p>
        <h3>Update Profile</h3>
        <div className="pay-grid">
          <label>
            Email
            <input value={user?.email || ""} disabled />
          </label>
          <label>
            User ID
            <input value={user?.id || ""} disabled />
          </label>
          <label>
            Name
            <input value={profileName} onChange={(e) => setProfileName(e.target.value)} />
          </label>
          <label>
            Handle
            <input value={handle} onChange={(e) => setHandle(e.target.value)} />
          </label>
          <label>
            Phone
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label>
            Profile Picture URL
            <input
              value={profileImageUrl}
              onChange={(e) => setProfileImageUrl(e.target.value)}
              placeholder="https://..."
            />
          </label>
          <label>
            Upload Profile Picture
            <input
              type="file"
              accept="image/*"
              onChange={(e) => uploadProfileImage(e.target.files?.[0])}
              disabled={uploading}
            />
          </label>
        </div>
        <button className="cta" onClick={saveProfile}>Save</button>
        {status && <p className="muted">{status}</p>}
        {error && <p className="error">{error}</p>}
      </div>
    </section>
  );
}
