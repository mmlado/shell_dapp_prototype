import { describe, it, expect } from "vitest";
import { decode, type TagDecoder } from "cborg";
import { URDecoder } from "@ngraveio/bc-ur";
import { buildBtcSignRequestUR, type BtcKeyType } from "../lib/btcSignRequest";

const BTC_LEGACY_ADDRESS = "12CL4K2eVqj7hQTix7dM7CVHCkpP17Pry3";
const SOURCE_FINGERPRINT = 0x68161a1c;

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
    expect(hex).toContain("d825"); // tag(37) marker
  });

  const KEY_TYPE_CASES: Array<[BtcKeyType, number]> = [
    ["btcLegacy", 44],
    ["btcNestedSegwit", 49],
    ["btcNativeSegwit", 84],
  ];

  for (const [keyType, expectedPurpose] of KEY_TYPE_CASES) {
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
      expect(components[1]).toBe(true); // hardened
      expect(components[2]).toBe(0); // coin type = 0 (BTC)
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
});
