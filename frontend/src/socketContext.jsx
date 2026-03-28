import { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./authContext.jsx";
import { API_URL, WS_URL } from "./config.js";

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!user) {
      // logout হলে disconnect করো
      setSocket((prev) => {
        prev?.disconnect();
        return null;
      });
      return;
    }

    const s = io(`${API_URL}`, {
      withCredentials: true,
      transports: ["polling", "websocket"], // polling first (Railway compatible), then upgrade
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000
    });

    s.on("connect", () => {
      console.log("[socket] connected:", s.id);
    });

    s.on("connect_error", (err) => {
      console.warn("[socket] connection error:", err.message);
    });

    s.on("disconnect", (reason) => {
      console.log("[socket] disconnected:", reason);
    });

    setSocket(s);

    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [user?.id]); // user ID পরিবর্তন হলেই reconnect

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
