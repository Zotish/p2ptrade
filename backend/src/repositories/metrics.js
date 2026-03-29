import { get } from "../db.js";

export async function getUserCounts(windowMinutes = 10) {
  const totalRow = await get("select count(*) as total from users", []);
  const liveRow = await get(
    `select count(*) as live from users where last_seen_at >= (CURRENT_TIMESTAMP - INTERVAL '${windowMinutes} minutes')`,
    []
  );
  return {
    total: Number(totalRow?.total || 0),
    live: Number(liveRow?.live || 0)
  };
}

export async function getTradeVolumeUsd() {
  const row = await get(
    `select sum(o.amount_token * off.price_usd) as total_usd, count(*) as trades
     from orders o
     join offers off on off.id = o.offer_id
     where o.status = 'released'`,
    []
  );
  return {
    totalUsd: Number(row?.total_usd || 0),
    trades: Number(row?.trades || 0)
  };
}
