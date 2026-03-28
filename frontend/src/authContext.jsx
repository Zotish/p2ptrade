import { createContext, useContext, useEffect, useState } from "react";
import { apiFetch } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanTick, setScanTick] = useState(0);

  async function refresh() {
    try {
      const res = await apiFetch("/auth/me");
      if (!res.ok) {
        setUser(null);
      } else {
        const data = await res.json();
        setUser(data.user || null);
        if (data.user) {
          apiFetch("/scan/recent", {
            method: "POST",
            body: JSON.stringify({ blocks: 2000 })
          })
            .then(() => setScanTick((v) => v + 1))
            .catch(() => {});
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await apiFetch("/auth/logout", {
      method: "POST",
    });
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setUser(null);
  }

  function setSession(nextUser) {
    setUser(nextUser || null);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout, scanTick, setSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
