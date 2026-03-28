import bs58 from "bs58";
import { createHash } from "node:crypto";

function sha256(data) {
  return createHash("sha256").update(data).digest();
}

export function tronHexFromEthAddress(ethAddress) {
  const clean = String(ethAddress || "").replace(/^0x/, "");
  return `41${clean}`;
}

export function tronAddressFromEth(ethAddress) {
  const hex = tronHexFromEthAddress(ethAddress);
  const bytes = Buffer.from(hex, "hex");
  const checksum = sha256(sha256(bytes)).subarray(0, 4);
  return bs58.encode(Buffer.concat([bytes, checksum]));
}

export function tronHexFromAddress(address) {
  const decoded = bs58.decode(String(address));
  return Buffer.from(decoded.subarray(0, 21)).toString("hex");
}

export function tronAddressEquals(address, hexAddress) {
  const target = String(hexAddress || "");
  if (target.startsWith("T")) {
    return String(address).toLowerCase() === target.toLowerCase();
  }
  const decodedHex = tronHexFromAddress(address);
  const clean = target.replace(/^0x/, "");
  return decodedHex.toLowerCase() === clean.toLowerCase();
}
