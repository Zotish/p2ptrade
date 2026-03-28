import { Server } from "socket.io";
import { verifyToken } from "./auth.js";
import { config } from "./config.js";

let io;

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: config.corsOrigin, credentials: true }
  });

  // Auth middleware — cookie থেকে JWT verify করে
  io.use((socket, next) => {
    const cookieHeader = socket.handshake.headers.cookie || "";
    const match = cookieHeader.match(/(?:^|;\s*)access_token=([^;]+)/);
    if (!match) return next(new Error("Unauthorized"));
    try {
      const payload = verifyToken(decodeURIComponent(match[1]));
      socket.data.userId = payload.id || payload.sub;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.data.userId;
    // প্রতিটা user তার নিজস্ব room-এ join করে
    socket.join(`user:${userId}`);
    console.log(`[socket] connected  user:${userId}`);
    socket.on("disconnect", () => {
      console.log(`[socket] disconnected user:${userId}`);
    });
  });

  return io;
}

// specific user-এর room-এ event পাঠায়
export function emitToUser(userId, event, data) {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, data);
}
