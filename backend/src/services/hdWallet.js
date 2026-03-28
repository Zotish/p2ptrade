import { config } from "../config.js";
import bip39 from "bip39";
import { BIP32Factory } from "bip32";
import * as bitcoin from "bitcoinjs-lib";
import { HDNodeWallet } from "ethers";
import { derivePath } from "ed25519-hd-key";
import { Keypair } from "@solana/web3.js";
import * as ecc from "tiny-secp256k1";
import { tronAddressFromEth } from "./tronUtils.js";
import { deriveAddress as rippleDeriveAddress } from "ripple-keypairs";

const bip32 = BIP32Factory(ecc);

function getBtcPathPrefix() {
  return config.btcNetwork === "mainnet" ? "m/84'/0'/0'/0" : "m/84'/1'/0'/0";
}
const EVM_PATH_PREFIX = "m/44'/60'/0'/0";
const SOL_PATH_PREFIX = "m/44'/501'/0'/0'";

function getSeed() {
  if (!config.walletMnemonic) {
    throw new Error("Missing WALLET_MNEMONIC");
  }
  if (!bip39.validateMnemonic(config.walletMnemonic)) {
    throw new Error("Invalid WALLET_MNEMONIC");
  }
  return bip39.mnemonicToSeedSync(config.walletMnemonic);
}

export function deriveAddress(chain, index, kind) {
  if (kind === "evm") return deriveEvm(index);
  if (kind === "solana") return deriveSol(index);
  if (kind === "utxo") return deriveBtc(index);
  if (kind === "tron") return deriveTron(index);
  if (kind === "ripple") return deriveRipple(index);
  if (chain === "BTC") return deriveBtc(index);
  if (chain === "SOL") return deriveSol(index);
  return deriveEvm(index);
}

export function deriveTreasuryAddress(chain, kind) {
  return deriveAddress(chain, config.treasuryIndex, kind);
}

export function deriveEvmWalletByPath(path) {
  const seed = getSeed();
  const hd = HDNodeWallet.fromSeed(seed);
  return hd.derivePath(path);
}

export function deriveBtcKeyByPath(path) {
  const seed = getSeed();
  const network = config.btcNetwork === "mainnet" ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
  const root = bip32.fromSeed(seed, network);
  return root.derivePath(path);
}

export function deriveSolKeypairByPath(path) {
  const seed = getSeed();
  const derived = derivePath(path, seed.toString("hex"));
  return Keypair.fromSeed(derived.key);
}

function deriveBtc(index) {
  const seed = getSeed();
  const network = config.btcNetwork === "mainnet" ? bitcoin.networks.bitcoin : bitcoin.networks.testnet;
  const root = bip32.fromSeed(seed, network);
  const path = `${getBtcPathPrefix()}/${index}`;
  const child = root.derivePath(path);
  const { address } = bitcoin.payments.p2wpkh({ pubkey: child.publicKey, network });
  if (!address) throw new Error("Failed to derive BTC address");
  return { address, path, index };
}

function deriveEvm(index) {
  const seed = getSeed();
  const hd = HDNodeWallet.fromSeed(seed);
  const path = `${EVM_PATH_PREFIX}/${index}`;
  const wallet = hd.derivePath(path);
  return { address: wallet.address, path, index, publicKey: wallet.publicKey };
}

function deriveSol(index) {
  const seed = getSeed();
  const path = `${SOL_PATH_PREFIX}/${index}'`;
  const derived = derivePath(path, seed.toString("hex"));
  const keypair = Keypair.fromSeed(derived.key);
  return { address: keypair.publicKey.toBase58(), path, index };
}

function deriveTron(index) {
  const evm = deriveEvm(index);
  const tronAddress = tronAddressFromEth(evm.address);
  return { address: tronAddress, path: evm.path, index };
}

function deriveRipple(index) {
  const evm = deriveEvm(index);
  const pubKey = evm.publicKey || "";
  const hex = String(pubKey || "").replace(/^0x/, "");
  const address = rippleDeriveAddress(hex);
  return { address, path: evm.path, index };
}
