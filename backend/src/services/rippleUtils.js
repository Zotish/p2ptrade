import { encodeForSigning, encode } from "ripple-binary-codec";
import { sign } from "ripple-keypairs";

export function buildRipplePaymentTx({ account, destination, amountDrops, feeDrops, sequence, lastLedger }) {
  return {
    TransactionType: "Payment",
    Account: account,
    Destination: destination,
    Amount: amountDrops,
    Fee: String(feeDrops),
    Sequence: sequence,
    LastLedgerSequence: lastLedger
  };
}

export function signRippleTx(tx, privateKeyHex, publicKeyHex) {
  const txToSign = {
    ...tx,
    SigningPubKey: String(publicKeyHex || "").replace(/^0x/, "")
  };
  const signingData = encodeForSigning(txToSign);
  const signature = sign(signingData, String(privateKeyHex || "").replace(/^0x/, ""));
  const signed = {
    ...txToSign,
    TxnSignature: signature
  };
  return encode(signed);
}
