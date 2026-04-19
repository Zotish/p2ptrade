import { useState, useEffect, useRef, useCallback } from "react";
import { useSocket } from "../socketContext.jsx";

const API = import.meta.env.VITE_API_URL || "";

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const dropRef = useRef(null);
  const socket = useSocket();

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`${API}/notifications`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnread(data.unread || 0);
    } catch {}
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Real-time socket notification
  useEffect(() => {
    if (!socket) return;
    const handler = (notif) => {
      setNotifications((prev) => [notif, ...prev].slice(0, 30));
      setUnread((n) => n + 1);
    };
    socket.on("notification", handler);
    return () => socket.off("notification", handler);
  }, [socket]);

  // Outside click → close
  useEffect(() => {
    function handleClick(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function handleOpen() {
    setOpen((v) => !v);
    if (!open && unread > 0) {
      try {
        await fetch(`${API}/notifications/read-all`, {
          method: "PATCH",
          credentials: "include"
        });
        setUnread(0);
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      } catch {}
    }
  }

  function timeAgo(dateStr) {
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (diff < 60) return "এখনই";
    if (diff < 3600) return `${Math.floor(diff / 60)}m আগে`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h আগে`;
    return `${Math.floor(diff / 86400)}d আগে`;
  }

  const typeIcon = {
    order_created: "🔔",
    payment_submitted: "✅",
    order_released: "🎉",
    payment_rejected: "❌",
    dispute_raised: "⚠️"
  };

  return (
    <div className="notif-bell" ref={dropRef}>
      <button className="notif-btn" onClick={handleOpen} aria-label="Notifications">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span className="notif-badge">{unread > 99 ? "99+" : unread}</span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-header">
            <span>Notifications</span>
            {notifications.length > 0 && (
              <button className="notif-clear" onClick={async () => {
                await fetch(`${API}/notifications/read-all`, { method: "PATCH", credentials: "include" });
                setUnread(0);
                setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
              }}>সব পড়েছি</button>
            )}
          </div>

          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">কোনো notification নেই</div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className={`notif-item${n.is_read ? "" : " unread"}`}>
                  <span className="notif-icon">{typeIcon[n.type] || "🔔"}</span>
                  <div className="notif-content">
                    <div className="notif-title">{n.title}</div>
                    <div className="notif-body">{n.body}</div>
                    <div className="notif-time">{timeAgo(n.created_at)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
