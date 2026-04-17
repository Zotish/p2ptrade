import { config } from "../config.js";
import { all } from "../db.js";
import {
  deriveBtcKeyByPath,
  deriveEvmWalletByPath,
  deriveSolKeypairByPath,
  deriveTreasuryAddress
} from "./hdWallet.js";
import {
  createWithdrawal,
  getWithdrawalById,
  updateWithdrawal
} from "../repositories/withdrawals.js";
import { adjustBalance, getBalance } from "../repositories/balances.js";
import { getUserChainAddress } from "../repositories/wallets.js";
import { getAssetBySymbol, listActiveAssets, getChainByCode } from "../repositories/admin.js";
import { getPlatformFee, addPlatformFee } from "../repositories/platformFees.js";
import { ethers } from "ethers";
import * as bitcoin from "bitcoinjs-lib";
import {
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction
} from "@solana/web3.js";
import { fetchBtcJson, fetchBtcText, withEvmProvider, withSolConnection } from "./rpcProvider.js";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from "./solTokens.js";
import TronWeb from "tronweb";
import { withTronRpc, withRippleRpc } from "./rpcProvider.js";
import { signRippleTx, buildRipplePaymentTx } from "./rippleUtils.js";

const MINIMUMS = {
  BTC: 0.000001,
  USDT: 1,
  USDC: 1,
  ETH: 0.0001,
  BNB: 0.001,
  SOL: 0.1
};

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)"
];

/**
 * Check daily withdrawal limit for a user.
 * শেষ 24 ঘণ্টায় কতটা withdrawal করেছে সেটা count করে।
 */
async function checkDailyWithdrawalLimit(userId) {
  const maxCount = config.withdrawalDailyMaxCount;
  if (!maxCount) return; // 0 = disabled

  const rows = await all(
    `select count(*) as cnt from withdrawals
     where user_id = ?
       and status in ('pending_approval', 'sent')
       and created_at >= ((NOW() AT TIME ZONE 'UTC') - INTERVAL '24 hours')::text`,
    [userId]
  );
  const count = Number(rows[0]?.cnt || 0);
  if (count >= maxCount) {
    throw new Error(
      `Daily withdrawal limit reached (${maxCount} per 24 hours). Try again later.`
    );
  }
}

export async function requestWithdrawal({ userId, chain, asset, toAddress, amount }) {
  const assetRow = await getAssetBySymbol(asset);
  if (!assetRow || !assetRow.is_active || !assetRow.withdrawals_enabled) {
    throw new Error("Unsupported asset");
  }
  const min = MINIMUMS[asset] ?? 0;
  if (amount < min) {
    throw new Error(`Minimum withdrawal for ${asset} is ${min}`);
  }

  // ── Daily limit check ──────────────────────────────────────────
  await checkDailyWithdrawalLimit(userId);

  const chainCode = assetRow.chain_code;
  const chainRow = await getChainByCode(chainCode);
  if (!chainRow) throw new Error("Chain not found");

  const addressRow = await getUserChainAddress(userId, chainCode);
  if (!addressRow) throw new Error("No wallet address for chain");

  const estimatedFee = await estimateFee({
    chain: chainCode,
    chainKind: chainRow.kind,
    asset: assetRow,
    addressRow,
    toAddress,
    amount
  });

  const feeAsset = await getFeeAsset(assetRow, chainRow);
  const current = await getBalance(userId, asset);
  const feeBalance = await getBalance(userId, feeAsset);
  if (feeAsset === asset) {
    if (current < amount + estimatedFee) {
      throw new Error(`Insufficient ${feeAsset} balance. Need ${amount + estimatedFee}`);
    }
  } else {
    if (current < amount) {
      throw new Error("Insufficient balance");
    }
    if (feeBalance < estimatedFee) {
      throw new Error(`Insufficient ${feeAsset} balance for network fee`);
    }
  }

  await adjustBalance(userId, asset, -amount);
  return createWithdrawal({
    userId,
    chain: chainCode,
    asset,
    toAddress,
    amount,
    fee: 0,
    status: "pending_approval",
    txid: null
  });
}

export async function approveWithdrawal({ withdrawalId, adminUserId }) {
  const record = await getWithdrawalById(withdrawalId);
  if (!record) throw new Error("Withdrawal not found");
  if (record.status !== "pending_approval") {
    throw new Error("Withdrawal is not pending approval");
  }

  const assetRow = await getAssetBySymbol(record.asset);
  if (!assetRow) throw new Error("Asset not found");
  const chainRow = await getChainByCode(record.chain);
  if (!chainRow) throw new Error("Chain not found");

  const addressRow = await getUserChainAddress(record.user_id, record.chain);
  if (!addressRow) throw new Error("No wallet address for chain");

  const estimatedFee = await estimateFee({
    chain: record.chain,
    chainKind: chainRow.kind,
    asset: assetRow,
    addressRow,
    toAddress: record.to_address,
    amount: record.amount
  });

  const feeAsset = await getFeeAsset(assetRow, chainRow);
  const feeBalance = await getBalance(record.user_id, feeAsset);
  if (feeBalance < estimatedFee) {
    throw new Error(`Insufficient ${feeAsset} balance for network fee`);
  }

  let sent;
  if (chainRow.kind === "utxo") {
    if (record.chain !== "BTC" || Number(assetRow.is_native) !== 1) {
      throw new Error("UTXO tokens not supported");
    }
    sent = await sendBtc({
      addressRow,
      toAddress: record.to_address,
      amount: record.amount
    });
  } else if (chainRow.kind === "solana") {
    if (Number(assetRow.is_native) === 1) {
      sent = await sendSol({
        chain: record.chain,
        addressRow,
        toAddress: record.to_address,
        amount: record.amount
      });
    } else {
      sent = await sendSplToken({
        chain: record.chain,
        addressRow,
        toAddress: record.to_address,
        amount: record.amount,
        mint: assetRow.contract_address,
        decimals: Number(assetRow.decimals || 0)
      });
    }
  } else if (chainRow.kind === "tron") {
    sent = await sendTron({
      chain: record.chain,
      asset: assetRow,
      addressRow,
      toAddress: record.to_address,
      amount: record.amount
    });
  } else if (chainRow.kind === "ripple") {
    sent = await sendRipple({
      chain: record.chain,
      asset: assetRow,
      addressRow,
      toAddress: record.to_address,
      amount: record.amount
    });
  } else {
    sent = await sendEvm({
      chain: record.chain,
      asset: assetRow,
      addressRow,
      toAddress: record.to_address,
      amount: record.amount
    });
  }

  if (sent.fee > 0) {
    await adjustBalance(record.user_id, feeAsset, -sent.fee);
  }

  return updateWithdrawal(record.id, {
    fee: sent.fee,
    txid: sent.txid,
    status: "sent",
    approved_by: adminUserId,
    approved_at: new Date().toISOString(),
    rejected_reason: null
  });
}

export async function adminTreasuryWithdraw({ adminUserId, asset, amount, toAddress }) {
  const assetRow = await getAssetBySymbol(asset);
  if (!assetRow || !assetRow.is_active) {
    throw new Error("Unsupported asset");
  }
  const chainRow = await getChainByCode(assetRow.chain_code);
  if (!chainRow) throw new Error("Chain not found");

  if (!amount || Number(amount) <= 0) {
    throw new Error("Invalid withdrawal amount");
  }
  if (!toAddress) {
    throw new Error("Missing destination address");
  }

  const platform = await getPlatformFee(asset);
  if (Number(platform.amount || 0) < Number(amount)) {
    throw new Error(`Insufficient platform fee balance for ${asset}`);
  }

  const treasury = deriveTreasuryAddress(chainRow.code, chainRow.kind);
  const addressRow = { address: treasury.address, path: treasury.path };

  const estimatedFee = await estimateFee({
    chain: chainRow.code,
    chainKind: chainRow.kind,
    asset: assetRow,
    addressRow,
    toAddress,
    amount: Number(amount)
  });

  if (chainRow.kind === "utxo" && chainRow.code !== "BTC") {
    throw new Error("UTXO withdrawals supported only for BTC");
  }

  let sent;
  if (chainRow.kind === "utxo") {
    sent = await sendBtc({
      addressRow,
      toAddress,
      amount: Number(amount)
    });
  } else if (chainRow.kind === "solana") {
    if (Number(assetRow.is_native) === 1) {
      sent = await sendSol({
        chain: chainRow.code,
        addressRow,
        toAddress,
        amount: Number(amount)
      });
    } else {
      sent = await sendSplToken({
        chain: chainRow.code,
        addressRow,
        toAddress,
        amount: Number(amount),
        mint: assetRow.contract_address,
        decimals: Number(assetRow.decimals || 0)
      });
    }
  } else if (chainRow.kind === "tron") {
    sent = await sendTron({
      chain: chainRow.code,
      asset: assetRow,
      addressRow,
      toAddress,
      amount: Number(amount)
    });
  } else if (chainRow.kind === "ripple") {
    sent = await sendRipple({
      chain: chainRow.code,
      asset: assetRow,
      addressRow,
      toAddress,
      amount: Number(amount)
    });
  } else {
    sent = await sendEvm({
      chain: chainRow.code,
      asset: assetRow,
      addressRow,
      toAddress,
      amount: Number(amount)
    });
  }

  await addPlatformFee(asset, -Number(amount));
  return {
    txid: sent.txid,
    fee: sent.fee,
    estimatedFee
  };
}

export async function rejectWithdrawal({ withdrawalId, adminUserId, reason }) {
  const record = await getWithdrawalById(withdrawalId);
  if (!record) throw new Error("Withdrawal not found");
  if (record.status !== "pending_approval") {
    throw new Error("Withdrawal is not pending approval");
  }

  await adjustBalance(record.user_id, record.asset, record.amount);
  return updateWithdrawal(record.id, {
    status: "rejected",
    approved_by: adminUserId,
    approved_at: new Date().toISOString(),
    rejected_reason: reason || "Rejected by admin"
  });
}

export async function estimateWithdrawalFee({ userId, asset }) {
  const assetRow = await getAssetBySymbol(asset);
  if (!assetRow || !assetRow.is_active || !assetRow.withdrawals_enabled) {
    throw new Error("Unsupported asset");
  }
  const chainRow = await getChainByCode(assetRow.chain_code);
  if (!chainRow) throw new Error("Chain not found");

  const addressRow = await getUserChainAddress(userId, assetRow.chain_code);
  // Note: addressRow may be null if user hasn't created a wallet yet.
  // For non-UTXO chains, fee estimation doesn't need the address.
  // For UTXO chains (BTC), we need UTXOs — if no address, fee defaults to 0.

  const balance = await getBalance(userId, asset);
  const feeAsset = await getFeeAsset(assetRow, chainRow);

  let fee = 0;
  if (addressRow) {
    try {
      fee = await estimateFee({
        chain: assetRow.chain_code,
        chainKind: chainRow.kind,
        asset: assetRow,
        addressRow,
        toAddress: addressRow.address, // placeholder for fee estimation
        amount: balance > 0 ? balance : 1
      });
    } catch {
      // fee estimation failed (e.g. no UTXOs yet), return 0
      fee = 0;
    }
  } else if (chainRow.kind !== "utxo") {
    // For non-UTXO chains estimate fee without an address
    try {
      fee = await estimateFee({
        chain: assetRow.chain_code,
        chainKind: chainRow.kind,
        asset: assetRow,
        addressRow: { address: "" },
        toAddress: "",
        amount: balance > 0 ? balance : 1
      });
    } catch {
      fee = 0;
    }
  }

  const feeAssetBalance = feeAsset === asset ? balance : await getBalance(userId, feeAsset);
  const feeSameAsAsset = feeAsset === asset;

  // maxWithdrawable = balance - fee (if fee is in same asset), else = balance
  const maxWithdrawable = feeSameAsAsset
    ? Math.max(0, Number((balance - fee).toFixed(8)))
    : balance;

  return { fee, feeAsset, balance, feeAssetBalance, feeSameAsAsset, maxWithdrawable };
}

async function getFeeAsset(assetRow, chainRow) {
  if (chainRow.kind === "utxo") return chainRow.code;
  if (chainRow.kind === "solana") return chainRow.code;
  if (Number(assetRow.is_native) === 1) return assetRow.symbol;
  const assets = await listActiveAssets();
  const native = assets.find(
    (a) => a.chain_code === chainRow.code && Number(a.is_native) === 1
  );
  return native ? native.symbol : chainRow.code;
}

async function estimateFee({ chain, chainKind, asset, addressRow, amount }) {
  if (chainKind === "solana") return 0.000005;
  if (chainKind === "tron") return 0;
  if (chainKind === "ripple") return 0.000012;
  if (chainKind === "utxo") {
    const utxos = await fetchBtcJson(`/address/${addressRow.address}/utxo`);
    if (!Array.isArray(utxos) || utxos.length === 0) throw new Error("No BTC UTXOs");
    let inputSum = 0;
    let inputCount = 0;
    const target = Math.round(amount * 1e8);
    for (const u of utxos) {
      inputSum += u.value;
      inputCount += 1;
      if (inputSum >= target) break;
    }
    const feeRate = await fetchBtcJson("/v1/fees/recommended");
    const satPerVb = feeRate.fastestFee || 10;
    const estSize = 180 * inputCount + 34 * 2 + 10;
    return Math.round(satPerVb * estSize) / 1e8;
  }

  return withEvmProvider(chain, async (provider) => {
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas;
    if (!gasPrice) throw new Error("Unable to estimate gas price");
    const gasLimit = Number(asset.is_native) === 1 ? 21000n : 65000n;
    return Number(ethers.formatEther(gasLimit * gasPrice));
  });
}

async function sendEvm({ chain, asset, addressRow, toAddress, amount }) {
  return withEvmProvider(chain, async (provider) => {
    const wallet = deriveEvmWalletByPath(addressRow.path).connect(provider);
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas;
    if (!gasPrice) throw new Error("Unable to estimate gas price");

    if (Number(asset.is_native) === 1) {
      const gasLimit = 21000n;
      const fee = Number(ethers.formatEther(gasLimit * gasPrice));
      const value = ethers.parseEther(String(amount));
      const tx = await wallet.sendTransaction({ to: toAddress, value, gasLimit, gasPrice });
      return { txid: tx.hash, fee };
    }

    const contractAddress = asset.contract_address;
    if (!contractAddress) throw new Error("Unsupported token contract");

    const contract = new ethers.Contract(contractAddress, ERC20_ABI, wallet);
    const decimals = Number.isFinite(Number(asset.decimals)) ? Number(asset.decimals) : 18;
    const scaled = ethers.parseUnits(String(amount), decimals);
    const gasLimit = 65000n;
    const fee = Number(ethers.formatEther(gasLimit * gasPrice));
    const tx = await contract.transfer(toAddress, scaled, { gasLimit, gasPrice });
    return { txid: tx.hash, fee };
  });
}

async function sendSol({ chain, addressRow, toAddress, amount }) {
  return withSolConnection(chain, async (connection) => {
    const keypair = deriveSolKeypairByPath(addressRow.path);
    const accountInfo = await connection.getAccountInfo(keypair.publicKey);
    if (!accountInfo) {
      throw new Error(
        `Source SOL account not funded on-chain. Deposit SOL to ${keypair.publicKey.toBase58()} before withdrawing.`
      );
    }
    const lamports = Math.round(amount * 1e9);
    const feeLamports = 5000;
    const balance = await connection.getBalance(keypair.publicKey);
    if (balance < lamports + feeLamports) {
      throw new Error(
        `On-chain SOL balance too low for amount + fee. Deposit SOL to ${keypair.publicKey.toBase58()}.`
      );
    }
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: new PublicKey(toAddress),
        lamports
      })
    );
    const sig = await sendAndConfirmTransaction(connection, tx, [keypair]);
    const fee = 0.000005;
    return { txid: sig, fee };
  });
}

async function sendTron({ chain, asset, addressRow, toAddress, amount }) {
  const wallet = deriveEvmWalletByPath(addressRow.path);
  const privateKey = wallet.privateKey.replace(/^0x/, "");
  return withTronRpc(chain, async (rpcUrl) => {
    const tronWeb = new TronWeb({ fullHost: rpcUrl, privateKey });
    if (Number(asset.is_native) === 1) {
      const sun = Math.round(Number(amount) * 1e6);
      const tx = await tronWeb.trx.sendTransaction(toAddress, sun, privateKey);
      if (!tx.result) throw new Error("TRX transfer failed");
      return { txid: tx.txid, fee: 0 };
    }
    const contractAddress = asset.contract_address;
    if (!contractAddress) throw new Error("Missing token contract");
    const decimals = Number.isFinite(Number(asset.decimals)) ? Number(asset.decimals) : 6;
    const scaled = BigInt(Math.round(Number(amount) * 10 ** decimals));
    const contract = await tronWeb.contract().at(contractAddress);
    const txid = await contract.transfer(toAddress, scaled.toString()).send({
      feeLimit: 100_000_000
    });
    return { txid, fee: 0 };
  });
}

async function sendRipple({ chain, asset, addressRow, toAddress, amount }) {
  const wallet = deriveEvmWalletByPath(addressRow.path);
  const privateKey = wallet.privateKey.replace(/^0x/, "");
  const publicKey = wallet.publicKey;
  const account = addressRow.address;
  return withRippleRpc(chain, async (rpcUrl) => {
    const feeRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method: "fee", params: [{}] })
    });
    const feeJson = await feeRes.json();
    const feeDrops = Number(feeJson?.result?.drops?.open_ledger_fee || 12);

    const infoRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method: "account_info", params: [{ account }] })
    });
    const infoJson = await infoRes.json();
    const sequence = infoJson?.result?.account_data?.Sequence;
    const ledger = infoJson?.result?.ledger_current_index;
    if (!sequence || !ledger) throw new Error("Unable to load XRP sequence");

    const isNative = Number(asset.is_native) === 1;
    const amountField = isNative
      ? String(Math.round(Number(amount) * 1e6))
      : buildIssuedAmount(asset, amount);
    if (!amountField) {
      throw new Error("Invalid Ripple token format (use CURRENCY:ISSUER)");
    }
    const tx = buildRipplePaymentTx({
      account,
      destination: toAddress,
      amountDrops: amountField,
      feeDrops,
      sequence,
      lastLedger: Number(ledger) + 4
    });
    const txBlob = signRippleTx(tx, privateKey, publicKey);
    const submitRes = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method: "submit", params: [{ tx_blob: txBlob }] })
    });
    const submitJson = await submitRes.json();
    const txid = submitJson?.result?.tx_json?.hash || submitJson?.result?.tx_json?.hash;
    if (!txid) {
      throw new Error(submitJson?.result?.engine_result_message || "XRP submit failed");
    }
    return { txid, fee: feeDrops / 1e6 };
  });
}

function buildIssuedAmount(asset, amount) {
  const spec = String(asset.contract_address || "");
  if (!spec.includes(":")) return null;
  const [currency, issuer] = spec.split(":");
  if (!currency || !issuer) return null;
  return {
    currency: String(currency).toUpperCase(),
    issuer: String(issuer),
    value: String(amount)
  };
}

function createSplTransferIx({ source, destination, owner, amount }) {
  const data = Buffer.alloc(9);
  data[0] = 3;
  data.writeBigUInt64LE(BigInt(amount), 1);
  return new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: source, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: true, isWritable: false }
    ],
    data
  });
}

function createAssociatedTokenAccountIx({ payer, associatedToken, owner, mint }) {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false }
    ],
    data: Buffer.alloc(0)
  });
}

async function sendSplToken({ chain, addressRow, toAddress, amount, mint, decimals }) {
  if (!mint) throw new Error("Missing token mint");
  return withSolConnection(chain, async (connection) => {
    const keypair = deriveSolKeypairByPath(addressRow.path);
    const owner = keypair.publicKey;
    const ownerInfo = await connection.getAccountInfo(owner);
    if (!ownerInfo) {
      throw new Error(
        `Source SOL account not funded on-chain. Deposit SOL to ${owner.toBase58()} to cover fees.`
      );
    }
    const feeLamports = 5000;
    const ownerBalance = await connection.getBalance(owner);
    if (ownerBalance < feeLamports) {
      throw new Error(
        `Insufficient SOL for fees. Deposit a small amount of SOL to ${owner.toBase58()}.`
      );
    }
    const mintKey = new PublicKey(mint);
    const sourceAta = getAssociatedTokenAddress(mintKey, owner);
    const destOwner = new PublicKey(toAddress);
    const destAta = getAssociatedTokenAddress(mintKey, destOwner);

    const sourceInfo = await connection.getAccountInfo(sourceAta);
    if (!sourceInfo) throw new Error("Source token account not found");

    const destInfo = await connection.getAccountInfo(destAta);
    const instructions = [];
    if (!destInfo) {
      instructions.push(
        createAssociatedTokenAccountIx({
          payer: owner,
          associatedToken: destAta,
          owner: destOwner,
          mint: mintKey
        })
      );
    }

    const scale = 10 ** Number(decimals || 0);
    const rawAmount = BigInt(Math.round(Number(amount) * scale));
    instructions.push(
      createSplTransferIx({
        source: sourceAta,
        destination: destAta,
        owner,
        amount: rawAmount
      })
    );

    const tx = new Transaction().add(...instructions);
    const sig = await sendAndConfirmTransaction(connection, tx, [keypair]);
    const fee = 0.000005;
    return { txid: sig, fee };
  });
}

async function sendBtc({ addressRow, toAddress, amount }) {
  const fromAddress = addressRow.address;
  const utxos = await fetchBtcJson(`/address/${fromAddress}/utxo`);
  if (!Array.isArray(utxos) || utxos.length === 0) throw new Error("No BTC UTXOs");

  const target = Math.round(amount * 1e8);
  let inputSum = 0;
  const inputs = [];
  for (const u of utxos) {
    inputs.push(u);
    inputSum += u.value;
    if (inputSum >= target) break;
  }

  const feeRate = await fetchBtcJson("/v1/fees/recommended");
  const satPerVb = feeRate.fastestFee || 10;
  const estSize = 180 * inputs.length + 34 * 2 + 10;
  const fee = Math.round(satPerVb * estSize);
  const change = inputSum - target - fee;
  if (change < 0) throw new Error("Insufficient BTC for fee");

  const keyNode = deriveBtcKeyByPath(addressRow.path);
  const network =
    config.btcNetwork === "mainnet" ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
  const psbt = new bitcoin.Psbt({ network });

  for (const input of inputs) {
    const raw = await fetchBtcText(`/tx/${input.txid}/hex`);
    psbt.addInput({
      hash: input.txid,
      index: input.vout,
      nonWitnessUtxo: Buffer.from(raw, "hex")
    });
  }

  psbt.addOutput({ address: toAddress, value: target });
  if (change > 0) {
    psbt.addOutput({ address: fromAddress, value: change });
  }

  inputs.forEach((_, idx) => psbt.signInput(idx, keyNode));
  psbt.finalizeAllInputs();
  const tx = psbt.extractTransaction().toHex();
  const txid = await broadcastBtcTx(tx);

  return { txid, fee: fee / 1e8 };
}

async function broadcastBtcTx(hex) {
  let lastError = null;
  for (const base of config.btcApiUrls) {
    try {
      const res = await fetch(`${base}/tx`, { method: "POST", body: hex });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return await res.text();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("BTC broadcast failed");
}
