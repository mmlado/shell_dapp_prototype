import { describe, expect, it } from "vitest";
import { etc, getPublicKey, signAsync } from "@noble/secp256k1";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  pubKeyToLegacyAddress,
  pubKeyToNativeSegwitAddress,
  pubKeyToNestedSegwitAddress,
} from "../lib/bitcoinAddress";
import { verifyBtcSignatureResponse } from "../lib/btcMessageVerification";

const PRIVATE_KEY_HEX =
  "1f1e1d1c1b1a191817161514131211100f0e0d0c0b0a09080706050403020100";

type AddressKind = "legacy" | "nested" | "native";

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
  return Uint8Array.of(
    0xfe,
    value & 0xff,
    (value >> 8) & 0xff,
    (value >> 16) & 0xff,
    (value >> 24) & 0xff,
  );
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

function addressFromKind(kind: AddressKind, publicKey: Uint8Array): string {
  if (kind === "legacy") return pubKeyToLegacyAddress(publicKey);
  if (kind === "nested") return pubKeyToNestedSegwitAddress(publicKey);
  return pubKeyToNativeSegwitAddress(publicKey);
}

function headerOffset(kind: AddressKind): number {
  if (kind === "legacy") return 31;
  if (kind === "nested") return 35;
  return 39;
}

async function createCompactSignature(message: string, kind: AddressKind) {
  const privateKey = etc.hexToBytes(PRIVATE_KEY_HEX);
  const publicKey = getPublicKey(privateKey, true);
  const recovered = await signAsync(bitcoinMessageHash(message), privateKey, {
    prehash: false,
    format: "recovered",
  });
  const header = Uint8Array.of(headerOffset(kind) + recovered[0]);
  const signatureBytes = concatBytes(header, recovered.slice(1));

  return {
    address: addressFromKind(kind, publicKey),
    publicKeyHex: etc.bytesToHex(publicKey),
    signature: btoa(String.fromCharCode(...signatureBytes)),
  };
}

describe("verifyBtcSignatureResponse", () => {
  it("accepts legacy P2PKH signatures", async () => {
    const message = "Hello legacy";
    const { address, publicKeyHex, signature } = await createCompactSignature(
      message,
      "legacy",
    );

    expect(
      verifyBtcSignatureResponse(address, message, signature, publicKeyHex),
    ).toBe(true);
  });

  it("accepts nested SegWit signatures", async () => {
    const message = "Hello nested";
    const { address, publicKeyHex, signature } = await createCompactSignature(
      message,
      "nested",
    );

    expect(
      verifyBtcSignatureResponse(address, message, signature, publicKeyHex),
    ).toBe(true);
  });

  it("accepts native SegWit signatures", async () => {
    const message = "Hello native";
    const { address, publicKeyHex, signature } = await createCompactSignature(
      message,
      "native",
    );

    expect(
      verifyBtcSignatureResponse(address, message, signature, publicKeyHex),
    ).toBe(true);
  });

  it("rejects an address that does not belong to the signing pubkey", async () => {
    const message = "Hello mismatch";
    const legacy = await createCompactSignature(message, "legacy");

    expect(
      verifyBtcSignatureResponse(
        "1BoatSLRHtKNngkdXEeobR76b53LETtpyT",
        message,
        legacy.signature,
        legacy.publicKeyHex,
      ),
    ).toBe(false);
  });

  it("rejects malformed base64", async () => {
    const message = "Hello malformed";
    const { address, publicKeyHex } = await createCompactSignature(
      message,
      "nested",
    );

    expect(
      verifyBtcSignatureResponse(
        address,
        message,
        "***not-base64***",
        publicKeyHex,
      ),
    ).toBe(false);
  });

  it("rejects invalid public key hex", async () => {
    const message = "Hello bad pubkey";
    const { address, signature } = await createCompactSignature(
      message,
      "nested",
    );

    expect(
      verifyBtcSignatureResponse(address, message, signature, "1234"),
    ).toBe(false);
  });

  it("rejects signatures with an invalid recovery header", async () => {
    const message = "Hello bad header";
    const { address, publicKeyHex, signature } = await createCompactSignature(
      message,
      "nested",
    );
    const bytes = Uint8Array.from(atob(signature), (char) =>
      char.charCodeAt(0),
    );
    bytes[0] = 26;
    const badHeaderSignature = btoa(String.fromCharCode(...bytes));

    expect(
      verifyBtcSignatureResponse(
        address,
        message,
        badHeaderSignature,
        publicKeyHex,
      ),
    ).toBe(false);
  });
});
