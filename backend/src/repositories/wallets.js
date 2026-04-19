import { all, get, run } from "../db.js";
import { randomUUID } from "node:crypto";

export async function listUserAddresses(userId) {
  return all(
    `select wa.*
     from wallet_addresses wa
     join (
       select chain, max(idx) as max_idx
       from wallet_addresses
       where user_id = ?
       group by chain
     ) latest
     on latest.chain = wa.chain and latest.max_idx = wa.idx
     where wa.user_id = ?
     order by wa.created_at desc`,
    [userId, userId]
  );
}

export async function getUserChainAddress(userId, chain) {
  return get(
    "select * from wallet_addresses where user_id = ? and chain = ? order by idx desc limit 1",
    [userId, chain]
  );
}

export async function getNextIndex(chain) {
  // PostgreSQL returns lowercase column names — use max_idx (not maxIdx)
  const row = await get("select max(idx) as max_idx from wallet_addresses where chain = ?", [chain]);
  const next = (row?.max_idx ?? -1) + 1;
  return next;
}

export async function createAddress({ userId, chain, address, path, idx }) {
  const id = randomUUID();
  await run(
    `insert into wallet_addresses (id, user_id, chain, address, path, idx)
     values (?,?,?,?,?,?)`,
    [id, userId, chain, address, path, idx]
  );
  return get("select * from wallet_addresses where id = ?", [id]);
}
