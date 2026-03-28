import { API_URL } from "./config.js";

let isRefreshing = false;
let refreshQueue = []; // pending requests waiting for new token

async function tryRefreshToken() {
  const refreshToken = localStorage.getItem("refresh_token");
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${refreshToken}`
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.token) {
      localStorage.setItem("access_token", data.token);
      if (data.refreshToken) localStorage.setItem("refresh_token", data.refreshToken);
      return data.token;
    }
  } catch {
    // silent fail
  }
  return null;
}

function buildRequest(path, options = {}, token) {
  const url = path.startsWith("http") ? path : `${API_URL}${path}`;
  return fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      ...(!(options.body instanceof FormData) && { "Content-Type": "application/json" }),
      ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem("access_token");
  const res = await buildRequest(path, options, token);

  // 401 → try refresh once, then retry
  if (res.status === 401 && path !== "/auth/refresh" && path !== "/auth/login") {
    if (!isRefreshing) {
      isRefreshing = true;
      const newToken = await tryRefreshToken();
      isRefreshing = false;

      // resolve all queued requests
      refreshQueue.forEach(resolve => resolve(newToken));
      refreshQueue = [];

      if (newToken) {
        // retry original request with new token
        return buildRequest(path, options, newToken);
      } else {
        // refresh failed → clear tokens
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
      }
    } else {
      // another refresh is in progress → queue this request
      const newToken = await new Promise(resolve => refreshQueue.push(resolve));
      if (newToken) return buildRequest(path, options, newToken);
    }
  }

  return res;
}
