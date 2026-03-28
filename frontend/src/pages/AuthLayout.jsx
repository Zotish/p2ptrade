import { Outlet, Link } from "react-router-dom";

export default function AuthLayout() {
  return (
    <div className="auth-page">
      <nav className="nav">
        <div className="logo">P2P ESCROW</div>
        <div className="nav-links">
          <Link to="/">Market</Link>
          <Link to="/trade">Trade</Link>
        </div>
        <div className="nav-cta">
          <Link className="ghost" to="/login">Login</Link>
        </div>
      </nav>
      <div className="auth-shell">
        <Outlet />
      </div>
    </div>
  );
}
