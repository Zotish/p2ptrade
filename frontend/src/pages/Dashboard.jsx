import { useAuth } from "../authContext.jsx";

export default function Dashboard() {
  const { user } = useAuth();
  return (
    <section className="wallets">
      <div className="wallet-card">
        <p className="kicker">Dashboard</p>
        <h3>Account Overview</h3>
        <p className="muted">Welcome back {user?.email || "user"}.</p>
      </div>
    </section>
  );
}
