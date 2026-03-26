import { describe, it, expect } from "vitest";
import { HDKey } from "@scure/bip32";
import {
  pubKeyToLegacyAddress,
  pubKeyToNativeSegwitAddress,
  pubKeyToNestedSegwitAddress,
} from "../lib/bitcoinAddress";

// BIP-32 test vector 1 — m/0/0 child of known root
// https://github.com/bitcoin/bips/blob/master/bip-0032.mediawiki#test-vector-1
const ROOT_XPUB =
  "xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8";

describe("pubKeyToLegacyAddress (P2PKH)", () => {
  it("derives correct legacy address from known xpub", () => {
    const root = HDKey.fromExtendedKey(ROOT_XPUB);
    const child = root.deriveChild(0).deriveChild(0);
    const addr = pubKeyToLegacyAddress(child.publicKey!);
    expect(addr).toMatch(/^1/); // mainnet P2PKH starts with 1
    expect(addr).toBe("12CL4K2eVqj7hQTix7dM7CVHCkpP17Pry3");
  });
});

describe("pubKeyToNativeSegwitAddress (P2WPKH)", () => {
  it("derives correct bech32 address from known xpub", () => {
    const root = HDKey.fromExtendedKey(ROOT_XPUB);
    const child = root.deriveChild(0).deriveChild(0);
    const addr = pubKeyToNativeSegwitAddress(child.publicKey!);
    expect(addr).toMatch(/^bc1q/);
  });
});

describe("pubKeyToNestedSegwitAddress (P2SH-P2WPKH)", () => {
  it("derives correct P2SH address from known xpub", () => {
    const root = HDKey.fromExtendedKey(ROOT_XPUB);
    const child = root.deriveChild(0).deriveChild(0);
    const addr = pubKeyToNestedSegwitAddress(child.publicKey!);
    expect(addr).toMatch(/^3/); // mainnet P2SH starts with 3
  });
});
