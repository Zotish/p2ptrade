function StarRating({ stars, interactive = false, onSelect }) {
  const full = Math.floor(stars);
  const half = !interactive && stars - full >= 0.5;

  if (interactive) {
    return (
      <span className="star-rating star-interactive">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`star-btn ${stars >= n ? "star-active" : ""}`}
            onClick={() => onSelect && onSelect(n)}
            aria-label={`${n} star`}
          >
            ★
          </button>
        ))}
      </span>
    );
  }

  return (
    <span className="star-rating" title={`${stars} / 5`}>
      {"★".repeat(full)}
      {half ? "½" : ""}
      {"☆".repeat(5 - full - (half ? 1 : 0))}
      <span className="star-score">{stars}</span>
    </span>
  );
}

export { StarRating };

export function OfferCard({
  offer,
  actionLabel = "Start Trade",
  onAction,
  chatLabel = "Chat Seller",
  onChat
}) {
  const priceFiat    = offer.price_fiat ?? offer.priceFiat ?? offer.pricePerToken ?? offer.price_usd;
  const minAmount    = offer.min_amount ?? offer.minAmount;
  const maxAmount    = offer.max_amount ?? offer.maxAmount;
  const _pm = offer.payment_methods ?? offer.paymentMethods ?? [];
  const paymentMethods = Array.isArray(_pm)
    ? _pm
    : typeof _pm === "string"
      ? (() => { try { return JSON.parse(_pm); } catch { return _pm.split(",").map(s => s.trim()).filter(Boolean); } })()
      : [];
  const stats   = offer.sellerStats;
  const profile = offer.sellerProfile;

  // Seller display name
  const sellerName   = profile?.profileName || profile?.handle || null;
  const sellerHandle = profile?.handle || null;
  const sellerAvatar = profile?.profileImageUrl || null;
  const initials     = sellerName ? sellerName.charAt(0).toUpperCase()
    : sellerHandle ? sellerHandle.charAt(0).toUpperCase()
    : "?";

  return (
    <div className="offer">
      {/* ── Seller profile row ── */}
      <div className="seller-profile-row">
        {sellerAvatar ? (
          <img src={sellerAvatar} alt="seller" className="seller-avatar" />
        ) : (
          <div className="seller-avatar-placeholder">{initials}</div>
        )}
        <div className="seller-info">
          <span className="seller-display-name">
            {sellerName || sellerHandle || "Anonymous"}
          </span>
          {sellerHandle && sellerName && (
            <span className="muted small"> @{sellerHandle}</span>
          )}
        </div>
      </div>

      <div className="offer-head">
        <h4>{offer.token} → {offer.fiat}</h4>
        <span className="tag">{offer.country}</span>
      </div>

      <p className="amount">{priceFiat} {offer.fiat} per {offer.token}</p>
      <p className="muted">Limits: {minAmount} – {maxAmount}</p>

      {/* ── Seller rating row ── */}
      {stats && (
        <div className="seller-rating-row">
          <StarRating stars={stats.stars} />
          <span className="muted small">
            {stats.completionRate}% completion · {stats.completed} trades
            {stats.totalRatings > 0 && (
              <span className="rating-count"> · {stats.totalRatings} {stats.totalRatings === 1 ? "review" : "reviews"}</span>
            )}
            {stats.rejected > 0 && (
              <span className="rating-warn"> · {stats.rejected} rejected</span>
            )}
          </span>
        </div>
      )}

      <div className="payments">
        {paymentMethods.map((m) => (
          <span className="chip" key={m}>{m.replace(/_/g, " ")}</span>
        ))}
      </div>

      <div className="offer-actions">
        {onChat && (
          <button className="ghost" onClick={onChat}>{chatLabel}</button>
        )}
        {onAction && (
          <button className="cta" onClick={onAction}>{actionLabel}</button>
        )}
      </div>
    </div>
  );
}
