// ─── Central config — সব API URL এখান থেকে আসে ─────────────────
// Dev (port 5173) → localhost:4000
// Prod/ngrok (port 4000 বা 443/80) → same origin, relative URL
const isDev = window.location.port === "5173";
const defaultBackend = isDev ? `http://${window.location.hostname}:4000` : "";

export const API_URL = import.meta.env.VITE_API_URL ?? defaultBackend;
export const WS_URL  = import.meta.env.VITE_WS_URL  ?? defaultBackend;
