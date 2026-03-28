import { useEffect, useState } from "react";
import { apiFetch } from "../api.js";

export default function Market() {
  const [fiat, setFiat] = useState("USD");
  const [pairs, setPairs] = useState([]);
  const [assets, setAssets] = useState([]);
  const [fiats, setFiats] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/admin/public-catalog")
      .then((r) => r.json())
      .then((data) => {
        setAssets(data.assets || []);
        setFiats(data.fiats || []);
        if (data.fiats?.length && !data.fiats.find((f) => f.code === fiat)) {
          setFiat(data.fiats[0].code);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiFetch(`/market?fiat=${fiat}`, {
      cache: "no-store"
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed to load market");
        return data;
      })
      .then((data) => {
        setPairs(data.pairs || []);
        setError("");
      })
      .catch((err) => setError(err.message || "Failed to load market"));
  }, [fiat]);

  return (
    <section className="wallets">
      <div className="wallet-card">
        <div className="wallet-head">
          <div>
            <p className="kicker">Market</p>
            <h3>Crypto to Local Currency</h3>
            <p className="muted">Live prices from your platform.</p>
          </div>
          <select value={fiat} onChange={(e) => setFiat(e.target.value)}>
            {fiats.map((f) => (
              <option key={f.code} value={f.code}>
                {f.code} - {f.name}
              </option>
            ))}
          </select>
        </div>
        {error && <p className="error">{error}</p>}
        <div className="market-table">
          <div className="market-row market-head">
            <span>Pair</span>
            <span>Price</span>
            <span>Source</span>
          </div>
          {pairs.map((row) => (
            <div key={`${row.token}-${row.base}`} className="market-row">
              <span>{row.token}/{row.base}</span>
              <span>{row.price ? row.price : "-"}</span>
              <span>{row.source}</span>
            </div>
          ))}
        </div>
        {assets.length > 0 && (
          <p className="muted small">
            Active assets: {assets.map((asset) => asset.symbol).join(", ")}
          </p>
        )}
      </div>
    </section>
  );
}
