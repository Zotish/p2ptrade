import { listActiveDepositAssets } from "../repositories/admin.js";

let cached = { ts: 0, assets: [] };

async function loadAssets() {
  const now = Date.now();
  if (now - cached.ts < 60000 && cached.assets.length) {
    return cached.assets;
  }
  const assets = await listActiveDepositAssets();
  cached = { ts: now, assets };
  return assets;
}

export async function getEvmAssetsByChain(chainCode) {
  const assets = await loadAssets();
  const list = assets.filter((a) => a.chain_code === chainCode);
  const native = list.filter((a) => Number(a.is_native) === 1);
  const tokens = list.filter((a) => Number(a.is_native) !== 1 && a.contract_address);
  return { native, tokens, all: list };
}

export async function getSolAssetsByChain(chainCode) {
  const assets = await loadAssets();
  const list = assets.filter((a) => a.chain_code === chainCode);
  const native = list.filter((a) => Number(a.is_native) === 1);
  const tokens = list.filter((a) => Number(a.is_native) !== 1 && a.contract_address);
  return { native, tokens, all: list };
}

export async function listActiveDepositAssetsCached() {
  return loadAssets();
}
