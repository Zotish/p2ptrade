import { get, run } from "../db.js";

export async function getLastBlock(chain) {
  const row = await get("select last_block from chain_sync where chain = ?", [chain]);
  return row?.last_block || null;
}

export async function setLastBlock(chain, lastBlock) {
  await run(
    "insert into chain_sync (chain, last_block) values (?,?) on conflict(chain) do update set last_block = excluded.last_block, updated_at = CURRENT_TIMESTAMP",
    [chain, String(lastBlock)]
  );
}
