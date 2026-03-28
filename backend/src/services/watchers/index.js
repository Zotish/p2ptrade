import { startEvmWatcher } from "./evmWatcher.js";
import { startSolWatcher } from "./solWatcher.js";
import { startTronWatcher } from "./tronWatcher.js";
import { startRippleWatcher } from "./rippleWatcher.js";
import { startUtxoWatcher } from "./utxoWatcher.js";

export function startWatchers() {
  startUtxoWatcher();
  startEvmWatcher();
  startSolWatcher();
  startTronWatcher();
  startRippleWatcher();
}
