import { sha256 } from "@noble/hashes/sha2.js";
import { verify } from "@noble/secp256k1";
import {
  pubKeyToLegacyAddress,
  pubKeyToNativeSegwitAddress,
  pubKeyToNestedSegwitAddress,
} from "./bitcoinAddress";

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const length = arrays.reduce((sum, array) => sum + array.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;

  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }

  return result;
}

function encodeVarInt(value: number): Uint8Array {
  if (value < 0xfd) return Uint8Array.of(value);
  if (value <= 0xffff) {
    return Uint8Array.of(0xfd, value & 0xff, (value >> 8) & 0xff);
  }
  if (value <= 0xffffffff) {
    return Uint8Array.of(
      0xfe,
      value & 0xff,
      (value >> 8) & 0xff,
      (value >> 16) & 0xff,
      (value >> 24) & 0xff,
    );
  }
  throw new Error("Message too long");
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("Invalid hex string");
  }
  const matches = hex.match(/.{2}/g);
  if (!matches) return new Uint8Array();
  return new Uint8Array(matches.map((byte) => parseInt(byte, 16)));
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bitcoinMessageHash(message: string): Uint8Array {
  const prefix = new TextEncoder().encode("Bitcoin Signed Message:\n");
  const messageBytes = new TextEncoder().encode(message);
  const payload = concatBytes(
    Uint8Array.of(prefix.length),
    prefix,
    encodeVarInt(messageBytes.length),
    messageBytes,
  );
  return sha256(sha256(payload));
}

function addressFromPubKey(
  address: string,
  compressedPubKey: Uint8Array,
): string {
  if (address.startsWith("bc1q")) {
    return pubKeyToNativeSegwitAddress(compressedPubKey);
  }
  if (address.startsWith("3")) {
    return pubKeyToNestedSegwitAddress(compressedPubKey);
  }
  if (address.startsWith("1")) {
    return pubKeyToLegacyAddress(compressedPubKey);
  }
  throw new Error(`Unsupported Bitcoin address format: ${address}`);
}

export function verifyBtcSignatureResponse(
  address: string,
  message: string,
  signatureBase64: string,
  publicKeyHex: string,
): boolean {
  try {
    const signatureBytes = base64ToBytes(signatureBase64);
    if (signatureBytes.length !== 65) return false;

    const recoveryHeader = signatureBytes[0];
    if (recoveryHeader < 27 || recoveryHeader > 42) return false;

    const compactSignature = signatureBytes.slice(1);
    const publicKey = hexToBytes(publicKeyHex);
    if (publicKey.length !== 33) return false;

    const expectedAddress = addressFromPubKey(address, publicKey);
    if (expectedAddress !== address) return false;

    return verify(compactSignature, bitcoinMessageHash(message), publicKey, {
      prehash: false,
    });
  } catch {
    return false;
  }
}
