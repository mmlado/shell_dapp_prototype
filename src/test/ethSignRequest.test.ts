import { describe, it, expect } from "vitest";
import { decode, type TagDecoder } from "cborg";
import { URDecoder } from "@ngraveio/bc-ur";
import {
  buildEthSignRequestUR,
  buildEthSignRequestURParts,
} from "../lib/ethSignRequest";

const ETH_ADDRESS = "0xa786ec7488A340964Fc4a0367144436BeB7904CE";
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

describe("buildEthSignRequestUR", () => {
  it("produces a valid ur:eth-sign-request", () => {
    const ur = buildEthSignRequestUR("Hello", ETH_ADDRESS, SOURCE_FINGERPRINT);
    expect(ur.toLowerCase()).toMatch(/^ur:eth-sign-request\//);
  });

  it("sets data-type to 3 (eth-raw-bytes for EIP-191)", () => {
    const ur = buildEthSignRequestUR("Hello", ETH_ADDRESS, SOURCE_FINGERPRINT);
    const { map } = decodeUR(ur);
    expect(map.get(3)).toBe(3);
  });

  it("encodes the message as UTF-8 bytes", () => {
    const message = "Hello Shell";
    const ur = buildEthSignRequestUR(message, ETH_ADDRESS, SOURCE_FINGERPRINT);
    const { map } = decodeUR(ur);
    const signData = map.get(2) as Uint8Array;
    expect(new TextDecoder().decode(signData)).toBe(message);
  });

  it("includes derivation path m/44'/60'/0'/0/0", () => {
    const ur = buildEthSignRequestUR("Hello", ETH_ADDRESS, SOURCE_FINGERPRINT);
    const { map } = decodeUR(ur);
    const keypath = map.get(5) as Map<number, unknown>;
    const components = keypath.get(1) as unknown[];
    expect(components).toEqual([
      44,
      true,
      60,
      true,
      0,
      true,
      0,
      false,
      0,
      false,
    ]);
  });

  it("includes source-fingerprint in keypath", () => {
    const ur = buildEthSignRequestUR("Hello", ETH_ADDRESS, SOURCE_FINGERPRINT);
    const { map } = decodeUR(ur);
    const keypath = map.get(5) as Map<number, unknown>;
    expect(keypath.get(2)).toBe(SOURCE_FINGERPRINT);
  });

  it("encodes address as 20 raw bytes", () => {
    const ur = buildEthSignRequestUR("Hello", ETH_ADDRESS, SOURCE_FINGERPRINT);
    const { map } = decodeUR(ur);
    const addrBytes = map.get(6) as Uint8Array;
    expect(addrBytes).toHaveLength(20);
    const hex =
      "0x" +
      [...addrBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(hex.toLowerCase()).toBe(ETH_ADDRESS.toLowerCase());
  });

  it("wraps request-id in CBOR tag 37 (UUID)", () => {
    const decoder = new URDecoder();
    const ur = buildEthSignRequestUR("Hello", ETH_ADDRESS, SOURCE_FINGERPRINT);
    decoder.receivePart(ur.toLowerCase());
    const cbor = new Uint8Array(decoder.resultUR().cbor);
    const hex = [...cbor].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(hex).toContain("d825");
  });

  it("splits long requests into animated multipart URs", () => {
    const longMessage = "Hello Shell ".repeat(80);
    const parts = buildEthSignRequestURParts(
      longMessage,
      ETH_ADDRESS,
      SOURCE_FINGERPRINT,
    );

    expect(parts.length).toBeGreaterThan(1);

    const decoder = new URDecoder();
    for (const part of parts) {
      decoder.receivePart(part.toLowerCase());
    }

    expect(decoder.isComplete()).toBe(true);
    expect(decoder.resultUR().type).toBe("eth-sign-request");
  });
});
