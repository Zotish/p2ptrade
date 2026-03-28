export function getTxExplorerUrl(chain, txid) {
  const hash = normalizeTxHash(txid);
  if (!hash) return null;

  if (chain === "BTC") {
    return `https://mempool.space/testnet/tx/${hash}`;
  }
  if (chain === "BNB" || chain === "USDT" || chain === "USDC") {
    return `https://testnet.bscscan.com/tx/${hash}`;
  }
  if (chain === "ETH") {
    return `https://sepolia.etherscan.io/tx/${hash}`;
  }
  if (chain === "SOL") {
    return `https://explorer.solana.com/tx/${hash}?cluster=testnet`;
  }
  return null;
}

function normalizeTxHash(txid) {
  if (!txid) return null;
  if (txid.startsWith("0x")) {
    const parts = txid.split(":");
    return parts[0];
  }
  const colonIndex = txid.indexOf(":");
  return colonIndex > -1 ? txid.slice(0, colonIndex) : txid;
}
