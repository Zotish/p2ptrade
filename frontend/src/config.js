// ─── Central config — সব API URL এখান থেকে আসে ─────────────────
// Dev (port 5173)  → http://localhost:4000 (direct)
// Production       → /api (Netlify proxy → Railway, same-origin cookie ✅)
const isDev = window.location.port === "5173";

export const API_URL = import.meta.env.VITE_API_URL ?? (isDev ? "http://localhost:4000" : "/api");
export const WS_URL  = import.meta.env.VITE_WS_URL  ?? (isDev ? "http://localhost:4000" : "");
