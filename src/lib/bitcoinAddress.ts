import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { bech32, base58check } from "@scure/base";

function hash160(pubKey: Uint8Array): Uint8Array {
  return ripemd160(sha256(pubKey));
}

// BIP-84: P2WPKH native SegWit → bc1q...
export function pubKeyToNativeSegwitAddress(
  compressedPubKey: Uint8Array,
): string {
  const h160 = hash160(compressedPubKey);
  const words = bech32.toWords(h160);
  words.unshift(0); // witness version 0
  return bech32.encode("bc", words);
}

// BIP-44: P2PKH legacy → 1...
export function pubKeyToLegacyAddress(compressedPubKey: Uint8Array): string {
  const h160 = hash160(compressedPubKey);
  const payload = new Uint8Array(21);
  payload[0] = 0x00; // mainnet P2PKH version byte
  payload.set(h160, 1);
  return base58check(sha256).encode(payload);
}

// BIP-49: P2SH-P2WPKH nested SegWit → 3...
export function pubKeyToNestedSegwitAddress(
  compressedPubKey: Uint8Array,
): string {
  const h160 = hash160(compressedPubKey);
  // redeemScript = OP_0 <20-byte-hash>
  const redeemScript = new Uint8Array(22);
  redeemScript[0] = 0x00;
  redeemScript[1] = 0x14;
  redeemScript.set(h160, 2);
  const scriptHash = hash160(redeemScript);
  const payload = new Uint8Array(21);
  payload[0] = 0x05; // mainnet P2SH version byte
  payload.set(scriptHash, 1);
  return base58check(sha256).encode(payload);
}

// Keep old export name for compatibility
export { pubKeyToNativeSegwitAddress as pubKeyToBtcAddress };
