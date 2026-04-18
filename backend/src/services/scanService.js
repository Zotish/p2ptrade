import { ethers } from "ethers";
import { all } from "../db.js";
import { createDepositIfNew } from "../repositories/deposits.js";
import { adjustBalance } from "../repositories/balances.js";
import { withEvmProvider, withSolConnection } from "./rpcProvider.js";

export async function scanBnbTx(txhash) {
  return withEvmProvider("BNB", async (provider) => {
    const tx = await provider.getTransaction(txhash);
    if (!tx) throw new Error("Transaction not found");
    const receipt = await provider.getTransactionReceipt(txhash);
    if (!receipt || receipt.status !== 1) throw new Error("Transaction not confirmed");
    if (!tx.to) throw new Error("No recipient");

    const toAddr = tx.to.toLowerCase();
    const rows = await all("select * from wallet_addresses where chain = 'BNB'", []);
    const row = rows.find((r) => r.address.toLowerCase() === toAddr);
    if (!row) throw new Error("Recipient not a deposit address");

    const amount = Number(ethers.formatEther(tx.value));
    if (amount <= 0) throw new Error("Zero amount");
    const txid = `${tx.hash}:${tx.to}`;
    const confirmations = Number(receipt.confirmations ?? 1);
    const { inserted } = await createDepositIfNew({
      addressId: row.id,
      chain: "BNB",
      txid,
      amount,
      confirmations,
      status: "confirmed"
    });
    if (!inserted) return { credited: false, reason: "already_credited" };
    await adjustBalance(row.user_id, "BNB", amount);
    return { credited: true, amount };
  });
}

export async function scanSolTx(txhash, userId) {
  return withSolConnection("SOL", async (connection) => {
    const tx = await connection.getTransaction(txhash, {
      maxSupportedTransactionVersion: 0
    });
    if (!tx || !tx.meta) throw new Error("Transaction not found");
    if (tx.meta.err) throw new Error("Transaction failed");

    const rows = await all(
      "select * from wallet_addresses where user_id = ? and chain = 'SOL'",
      [userId]
    );
    if (!rows.length) throw new Error("No SOL deposit address found");

    const keys = tx.transaction.message.accountKeys.map((k) =>
      typeof k === "string" ? k : k.toBase58()
    );

    for (const row of rows) {
      const index = keys.findIndex((k) => k === row.address);
      if (index < 0) continue;
      const pre = tx.meta.preBalances[index] || 0;
      const post = tx.meta.postBalances[index] || 0;
      const delta = (post - pre) / 1e9;
      if (delta <= 0) continue;
      const { inserted } = await createDepositIfNew({
        addressId: row.id,
        chain: "SOL",
        txid: txhash,
        amount: delta,
        confirmations: 1,
        status: "confirmed"
      });
      if (!inserted) return { credited: false, reason: "already_credited" };
      await adjustBalance(row.user_id, "SOL", delta);
      return { credited: true, amount: delta };
    }

    throw new Error("Recipient not a SOL deposit address");
  });
}
