export function HistoryTable({ title, rows = [], columns = [] }) {
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  }

  function renderCell(row, column) {
    const value = row[column];
    if (column === "status") {
      return <span className={`status-badge status-${String(value || "").toLowerCase()}`}>{value || "-"}</span>;
    }
    if (column === "txid" && typeof value === "string" && value.length > 18) {
      return (
        <span className="tx-actions">
          {row.tx_url ? (
            <a href={row.tx_url} target="_blank" rel="noreferrer" title={value}>
              {value.slice(0, 10)}...{value.slice(-8)}
            </a>
          ) : (
            <span title={value}>{value.slice(0, 10)}...{value.slice(-8)}</span>
          )}
          <button className="ghost small-btn" type="button" onClick={() => copyText(value)}>
            Copy
          </button>
        </span>
      );
    }
    return value ?? "-";
  }

  return (
    <div className="wallet-card">
      <h3>{title}</h3>
      <div className="market-table">
        <div className="market-row market-head">
          {(Array.isArray(columns) ? columns : []).map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        {(Array.isArray(rows) ? rows : []).length === 0 && (
          <div className="market-row">
            <span className="muted">No records</span>
            <span></span>
            <span></span>
          </div>
        )}
        {(Array.isArray(rows) ? rows : []).map((r, idx) => (
          <div className="market-row" key={r.id || idx}>
            {(Array.isArray(columns) ? columns : []).map((c) => (
              <span key={c}>{renderCell(r, c)}</span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
