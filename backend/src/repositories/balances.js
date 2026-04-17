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

/**
 * Atomic balance adjustment — race condition সমস্যা নেই।
 * Positive delta (credit): upsert করে amount বাড়ায়।
 * Negative delta (debit): conditional UPDATE — balance কম থাকলে throw করে।
 */
export async function adjustBalance(userId, asset, delta) {
  if (delta === 0) return getBalance(userId, asset);

  if (delta > 0) {
    // Credit — atomic upsert
    await run(
      `insert into balances (user_id, asset, amount)
       values (?,?,?)
       on conflict(user_id, asset) do update
         set amount = balances.amount + excluded.amount`,
      [userId, asset, delta]
    );
  } else {
    // Debit — only if sufficient balance (atomic, no race condition)
    const result = await run(
      `update balances
       set amount = amount + ?
       where user_id = ? and asset = ? and amount + ? >= 0`,
      [delta, userId, asset, delta]
    );
    if (result.rowCount === 0) {
      const current = await getBalance(userId, asset);
      throw new Error(
        `Insufficient ${asset} balance (have ${current}, need ${Math.abs(delta)})`
      );
    }
  }

  const row = await get("select amount from balances where user_id = ? and asset = ?", [userId, asset]);
  return Number(row?.amount || 0);
}

export async function listUserBalancesTotals() {
  return all(
    "select asset, sum(amount) as total from balances group by asset order by asset asc",
    []
  );
}
