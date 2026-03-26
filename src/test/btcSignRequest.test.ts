import { describe, it, expect } from "vitest";
import { decode, type TagDecoder } from "cborg";
import { URDecoder } from "@ngraveio/bc-ur";
import { etc, getPublicKey, signAsync } from "@noble/secp256k1";
import { Signer, Verifier } from "bip322-js";
import {
  buildBtcSignRequestUR,
  buildBtcSignRequestURParts,
  type BtcKeyType,
} from "../lib/btcSignRequest";
import { verifyBtcSignatureResponse } from "../lib/btcMessageVerification";
import { pubKeyToNestedSegwitAddress } from "../lib/bitcoinAddress";

const BTC_LEGACY_ADDRESS = "12CL4K2eVqj7hQTix7dM7CVHCkpP17Pry3";
const SOURCE_FINGERPRINT = 0x68161a1c;
const PRIVATE_KEY_WIF = "L3VFeEujGtevx9w18HD1fhRbCH67Az2dpCymeRE1SoPK6XQtaN2k";
const PRIVATE_KEY_HEX =
  "1f1e1d1c1b1a191817161514131211100f0e0d0c0b0a09080706050403020100";

function decodeUR(ur: string) {
  const decoder = new URDecoder();
  decoder.receivePart(ur.toLowerCase());
  const result = decoder.resultUR();
  return {
    type: result.type,
    map: decode(new Uint8Array(result.cbor), {
      useMaps: true,
      tags: Object.assign([] as TagDecoder[], {
        37: (v: unknown) => v,
        304: (v: unknown) => v,
      }),
    }) as Map<number, unknown>,
  };
}

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

async function createCompactSignature(message: string) {
  const privateKey = etc.hexToBytes(PRIVATE_KEY_HEX);
  const publicKey = getPublicKey(privateKey, true);
  const address = pubKeyToNestedSegwitAddress(publicKey);
  const prefix = new TextEncoder().encode("Bitcoin Signed Message:\n");
  const messageBytes = new TextEncoder().encode(message);
  const payload = concatBytes(
    Uint8Array.of(prefix.length),
    prefix,
    encodeVarInt(messageBytes.length),
    messageBytes,
  );
  const { sha256 } = await import("@noble/hashes/sha2.js");
  const digest = sha256(sha256(payload));
  const recovered = await signAsync(digest, privateKey, {
    prehash: false,
    format: "recovered",
  });
  const header = Uint8Array.of(35 + recovered[0]);
  const signatureBytes = concatBytes(header, recovered.slice(1));
  const signature = btoa(String.fromCharCode(...signatureBytes));
  const publicKeyHex = etc.bytesToHex(publicKey);

  return { address, publicKeyHex, signature };
}

describe("buildBtcSignRequestUR", () => {
  it("produces a valid ur:btc-sign-request", () => {
    const ur = buildBtcSignRequestUR(
      "Hello",
      BTC_LEGACY_ADDRESS,
      "btcLegacy",
      SOURCE_FINGERPRINT,
    );
    expect(ur.toLowerCase()).toMatch(/^ur:btc-sign-request\//);
  });

  it("sets data-type to 1 (btc-message)", () => {
    const ur = buildBtcSignRequestUR(
      "Hello",
      BTC_LEGACY_ADDRESS,
      "btcLegacy",
      SOURCE_FINGERPRINT,
    );
    const { map } = decodeUR(ur);
    expect(map.get(3)).toBe(1);
  });

  it("encodes the message as UTF-8 bytes", () => {
    const message = "Hello Shell";
    const ur = buildBtcSignRequestUR(
      message,
      BTC_LEGACY_ADDRESS,
      "btcLegacy",
      SOURCE_FINGERPRINT,
    );
    const { map } = decodeUR(ur);
    const signData = map.get(2) as Uint8Array;
    expect(new TextDecoder().decode(signData)).toBe(message);
  });

  it("includes the address as a text string in btc-addresses", () => {
    const ur = buildBtcSignRequestUR(
      "Hello",
      BTC_LEGACY_ADDRESS,
      "btcLegacy",
      SOURCE_FINGERPRINT,
    );
    const { map } = decodeUR(ur);
    const addresses = map.get(5) as string[];
    expect(addresses).toEqual([BTC_LEGACY_ADDRESS]);
  });

  it("wraps request-id in CBOR tag 37 (UUID)", () => {
    const decoder = new URDecoder();
    const ur = buildBtcSignRequestUR(
      "Hello",
      BTC_LEGACY_ADDRESS,
      "btcLegacy",
      SOURCE_FINGERPRINT,
    );
    decoder.receivePart(ur.toLowerCase());
    const cbor = new Uint8Array(decoder.resultUR().cbor);
    const hex = [...cbor].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(hex).toContain("d825");
  });

  const keyTypeCases: Array<[BtcKeyType, number]> = [
    ["btcLegacy", 44],
    ["btcNestedSegwit", 49],
    ["btcNativeSegwit", 84],
  ];

  for (const [keyType, expectedPurpose] of keyTypeCases) {
    it(`uses purpose ${expectedPurpose} for keyType ${keyType}`, () => {
      const ur = buildBtcSignRequestUR(
        "Hello",
        BTC_LEGACY_ADDRESS,
        keyType,
        SOURCE_FINGERPRINT,
      );
      const { map } = decodeUR(ur);
      const paths = map.get(4) as Map<number, unknown>[];
      const keypath = paths[0];
      const components = keypath.get(1) as unknown[];
      expect(components[0]).toBe(expectedPurpose);
      expect(components[1]).toBe(true);
      expect(components[2]).toBe(0);
    });
  }

  it("includes source-fingerprint in keypath", () => {
    const ur = buildBtcSignRequestUR(
      "Hello",
      BTC_LEGACY_ADDRESS,
      "btcLegacy",
      SOURCE_FINGERPRINT,
    );
    const { map } = decodeUR(ur);
    const paths = map.get(4) as Map<number, unknown>[];
    const keypath = paths[0];
    expect(keypath.get(2)).toBe(SOURCE_FINGERPRINT);
  });

  it("omits source-fingerprint when undefined", () => {
    const ur = buildBtcSignRequestUR(
      "Hello",
      BTC_LEGACY_ADDRESS,
      "btcLegacy",
      undefined,
    );
    const { map } = decodeUR(ur);
    const paths = map.get(4) as Map<number, unknown>[];
    const keypath = paths[0];
    expect(keypath.get(2)).toBeUndefined();
  });

  it("splits long requests into animated multipart URs", () => {
    const longMessage = "Hello Shell ".repeat(80);
    const parts = buildBtcSignRequestURParts(
      longMessage,
      BTC_LEGACY_ADDRESS,
      "btcLegacy",
      SOURCE_FINGERPRINT,
    );

    expect(parts.length).toBeGreaterThan(1);

    const decoder = new URDecoder();
    for (const part of parts) {
      decoder.receivePart(part.toLowerCase());
    }

    expect(decoder.isComplete()).toBe(true);
    expect(decoder.resultUR().type).toBe("btc-sign-request");
  });
});

describe("verifyBtcSignatureResponse", () => {
  it("verifies a browser-safe compact signature response", async () => {
    const message = "Hello World";
    const { address, publicKeyHex, signature } =
      await createCompactSignature(message);

    expect(
      verifyBtcSignatureResponse(address, message, signature, publicKeyHex),
    ).toBe(true);
  });

  it("rejects a signature for the wrong message", async () => {
    const { address, publicKeyHex, signature } =
      await createCompactSignature("Hello World");

    expect(
      verifyBtcSignatureResponse(
        address,
        "Different message",
        signature,
        publicKeyHex,
      ),
    ).toBe(false);
  });
});

describe("BIP-322 compatibility", () => {
  it("proves the Bitcoin message flow against bip322-js in test-only coverage", () => {
    const address = "37qyp7jQAzqb2rCBpMvVtLDuuzKAUCVnJb";
    const message = "Hello World";
    const signature = Signer.sign(PRIVATE_KEY_WIF, address, message);

    expect(Verifier.verifySignature(address, message, signature)).toBe(true);
  });
});
