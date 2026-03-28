import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png"],
      manifest: {
        name: "P2P Escrow",
        short_name: "P2P Escrow",
        description: "Safe peer-to-peer crypto trading across Africa",
        theme_color: "#f4b740",
        background_color: "#0f1015",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /\/admin\/public-catalog/,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 }
            }
          }
        ]
      }
    })
  ],
  server: {
    port: 5173,
    host: "0.0.0.0",  // IPv4 force — mobile থেকে access-এর জন্য
    allowedHosts: true  // ngrok / external tunnel সব allow
  }
});
