async function postJson(url, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function getJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function getText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function tryEvm(url) {
  const json = await postJson(url, { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] });
  if (!json?.result) return null;
  const chainId = parseInt(json.result, 16);
  if (!Number.isFinite(chainId)) return null;
  return { kind: "evm", network: `chainId:${chainId}` };
}

async function trySolana(url) {
  const health = await postJson(url, { jsonrpc: "2.0", id: 1, method: "getHealth", params: [] });
  if (!health) return null;
  return { kind: "solana", network: "unknown" };
}

async function tryRipple(url) {
  const info = await postJson(url, { method: "server_info", params: [{}] });
  if (!info?.result?.info) return null;
  return { kind: "ripple", network: "unknown" };
}

async function tryTron(url) {
  const json = await getJson(`${url.replace(/\/$/, "")}/wallet/getnowblock`);
  if (!json?.block_header?.raw_data?.number) return null;
  return { kind: "tron", network: "unknown" };
}

async function tryUtxo(url) {
  const text = await getText(`${url.replace(/\/$/, "")}/blocks/tip/height`);
  const height = Number(text);
  if (!Number.isFinite(height)) return null;
  return { kind: "utxo", network: "unknown" };
}

export async function detectChainFromRpc(urls) {
  const candidates = urls.filter(Boolean);
  if (!candidates.length) throw new Error("RPC URL required for auto-detect");

  for (const url of candidates) {
    try {
      const evm = await tryEvm(url);
      if (evm) return evm;
    } catch {}
    try {
      const sol = await trySolana(url);
      if (sol) return sol;
    } catch {}
    try {
      const ripple = await tryRipple(url);
      if (ripple) return ripple;
    } catch {}
    try {
      const tron = await tryTron(url);
      if (tron) return tron;
    } catch {}
    try {
      const utxo = await tryUtxo(url);
      if (utxo) return utxo;
    } catch {}
  }

  throw new Error("Unable to auto-detect chain kind from RPC");
}
