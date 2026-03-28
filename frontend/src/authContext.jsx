import { API_URL } from "./config.js";
import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scanTick, setScanTick] = useState(0);

  async function refresh() {
    try {
      const res = await fetch(`${API_URL}/auth/me`, { credentials: "include" });
      if (!res.ok) {
        setUser(null);
      } else {
        const data = await res.json();
        setUser(data.user || null);
        if (data.user) {
          fetch(`${API_URL}/scan/recent`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
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
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      credentials: "include"
    });
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
