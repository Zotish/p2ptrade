import { all, get, run } from "../db.js";

export async function getBalance(userId, asset) {
  const row = await get("select amount from balances where user_id = ? and asset = ?", [userId, asset]);
  return Number(row?.amount || 0);
}

export async function setBalance(userId, asset, amount) {
  await run(
    "insert into balances (user_id, asset, amount) values (?,?,?) on conflict(user_id, asset) do update set amount = excluded.amount",
    [userId, asset, amount]
  );
}

export async function adjustBalance(userId, asset, delta) {
  const current = await getBalance(userId, asset);
  const next = current + delta;
  await setBalance(userId, asset, next);
  return next;
}

export async function listUserBalancesTotals() {
  return all(
    "select asset, sum(amount) as total from balances group by asset order by asset asc",
    []
  );
}
