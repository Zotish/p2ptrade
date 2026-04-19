import { useState } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../authContext.jsx";
import NotificationBell from "../components/NotificationBell.jsx";

export default function Layout() {
  const { user, logout, loading } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!loading && user?.role === "admin" && location.pathname !== "/admin") {
    return <Navigate to="/admin" replace />;
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <div className="app">
      <nav className="nav">
        <div className="logo">P2P ESCROW</div>

        {/* Hamburger — শুধু mobile-এ দেখাবে */}
        <button
          className={`hamburger${menuOpen ? " open" : ""}`}
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle navigation"
        >
          <span />
          <span />
          <span />
        </button>

        {/* Nav links — desktop-এ inline, mobile-এ dropdown */}
        <div className={`nav-links${menuOpen ? " nav-open" : ""}`}>
          {user?.role === "admin" ? (
            <Link to="/admin" onClick={closeMenu}>Admin</Link>
          ) : (
            <>
              <Link to="/" onClick={closeMenu}>Home</Link>
              <Link to="/market" onClick={closeMenu}>Market</Link>
              <Link to="/trade" onClick={closeMenu}>Trade</Link>
              {user && <Link to="/wallets" onClick={closeMenu}>Wallets</Link>}
              {user && <Link to="/payments" onClick={closeMenu}>Payments</Link>}
              {user && <Link to="/dashboard" onClick={closeMenu}>Dashboard</Link>}
              {user && <Link to="/profile" onClick={closeMenu}>Profile</Link>}
              {user && <Link to="/security" onClick={closeMenu}>Security</Link>}
            </>
          )}
          {!user && !loading && (
            <>
              <Link to="/signup" onClick={closeMenu}>Sign up</Link>
              <Link to="/login" onClick={closeMenu}>Login</Link>
            </>
          )}

          {/* Mobile-only logout/CTA (desktop version is nav-cta below) */}
          <div className="nav-mobile-cta">
            {user ? (
              <button className="ghost" onClick={() => { logout(); closeMenu(); }}>
                Logout
              </button>
            ) : (
              <Link className="cta" to="/signup" onClick={closeMenu}>
                Get Started
              </Link>
            )}
          </div>
        </div>

        {/* Desktop CTA */}
        <div className="nav-cta">
          {user && <NotificationBell />}
          {user ? (
            <button className="ghost" onClick={logout}>Logout</button>
          ) : (
            <Link className="cta" to="/signup">Get Started</Link>
          )}
        </div>
      </nav>

      {/* Backdrop — menu খোলা থাকলে background-এ click করে বন্ধ করা যাবে */}
      {menuOpen && (
        <div className="nav-backdrop" onClick={closeMenu} />
      )}

      <Outlet />
    </div>
  );
}
