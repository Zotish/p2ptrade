import { all, get, run } from "../db.js";

export async function getPlatformFee(asset) {
  const row = await get("select * from platform_fees where asset = ?", [asset]);
  return row || { asset, amount: 0 };
}

export async function addPlatformFee(asset, amount) {
  await run(
    `insert into platform_fees (asset, amount, updated_at)
     values (?,?,datetime('now'))
     on conflict(asset) do update set amount = amount + excluded.amount, updated_at = datetime('now')`,
    [asset, amount]
  );
  return getPlatformFee(asset);
}

export async function listPlatformFees() {
  return all("select * from platform_fees order by asset asc", []);
}
