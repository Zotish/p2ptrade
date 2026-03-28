import { API_URL } from "./config.js";

export function apiFetch(path, options = {}) {
  const token = localStorage.getItem("access_token");
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
