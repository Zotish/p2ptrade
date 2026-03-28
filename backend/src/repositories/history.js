import { all } from "../db.js";
import { getTxExplorerUrl } from "../services/explorer.js";

export async function listDepositsForUser(userId) {
  const rows = await all(
    `select d.*, w.address as address
     from deposits d
     join wallet_addresses w on w.id = d.address_id
     where w.user_id = ?
     order by d.created_at desc`,
    [userId]
  );
  return rows.map((row) => ({
    ...row,
    tx_url: getTxExplorerUrl(row.chain, row.txid)
  }));
}

export async function listWithdrawalsForUser(userId) {
  const rows = await all(
    "select * from withdrawals where user_id = ? order by created_at desc",
    [userId]
  );
  return rows.map((row) => ({
    ...row,
    tx_url: getTxExplorerUrl(row.chain, row.txid)
  }));
}
