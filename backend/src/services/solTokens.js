import { PublicKey } from "@solana/web3.js";

export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);

export function getAssociatedTokenAddress(mint, owner) {
  const mintKey = typeof mint === "string" ? new PublicKey(mint) : mint;
  const ownerKey = typeof owner === "string" ? new PublicKey(owner) : owner;
  return PublicKey.findProgramAddressSync(
    [ownerKey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mintKey.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

export function getTokenBalanceDelta(tx, tokenAccount, mint) {
  if (!tx?.meta || !tx.transaction) return 0;
  const keys = tx.transaction.message.accountKeys.map((k) =>
    typeof k === "string" ? k : k.toBase58()
  );
  const accountIndex = keys.findIndex((k) => k === tokenAccount);
  if (accountIndex < 0) return 0;
  const pre = (tx.meta.preTokenBalances || []).find(
    (b) => b.accountIndex === accountIndex && (!mint || b.mint === mint)
  );
  const post = (tx.meta.postTokenBalances || []).find(
    (b) => b.accountIndex === accountIndex && (!mint || b.mint === mint)
  );
  const decimals =
    post?.uiTokenAmount?.decimals ??
    pre?.uiTokenAmount?.decimals ??
    0;
  const preAmount = pre ? Number(pre.uiTokenAmount.amount || 0) / 10 ** decimals : 0;
  const postAmount = post ? Number(post.uiTokenAmount.amount || 0) / 10 ** decimals : 0;
  return postAmount - preAmount;
}
