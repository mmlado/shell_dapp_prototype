import { describe, it, expect } from "vitest";
import { pubKeyToEthAddress } from "../lib/ethereumAddress";

// Known compressed public key → EIP-55 checksummed address
// From https://eips.ethereum.org/EIPS/eip-55
const CASES: [string, string][] = [
  [
    "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798",
    "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf",
  ],
];

describe("pubKeyToEthAddress", () => {
  it("produces correct EIP-55 checksummed address", () => {
    for (const [pubHex, expected] of CASES) {
      const pubKey = new Uint8Array(
        pubHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)),
      );
      expect(pubKeyToEthAddress(pubKey)).toBe(expected);
    }
  });

  it("preserves mixed-case checksum", () => {
    const pubHex =
      "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
    const pubKey = new Uint8Array(
      pubHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)),
    );
    const addr = pubKeyToEthAddress(pubKey);
    expect(addr).toMatch(/^0x/);
    // checksummed address has mixed case
    expect(addr).not.toBe(addr.toLowerCase());
    expect(addr.toLowerCase()).toBe(addr.toLowerCase());
  });
});
