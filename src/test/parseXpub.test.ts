import { describe, it, expect } from "vitest";
import { URDecoder } from "@ngraveio/bc-ur";
import { parseXpub } from "../lib/parseXpub";

// Real UR captured from a Shell device (m/44'/60'/0')
const ETH_HDKEY_UR =
  "ur:crypto-hdkey/osaowkaxhdclaojyhdtidmwprpltktftfefxmymottrfndlbiofwehbdgsbwgeglkstsembgkklfgsaahdcxghnbrsbzylkeiyuecfmwnlbggwhtkownwdeylahgjsykwshecxmhamsfecvtdeyaamtaaddyotadlncsdwykcsfnykaeykaocyiscmcyceaxaxaycylebgmkbzasjngrihkkiahsjpiecxguisihjzjzbkjohsiaiajlkpjtjydmjkjyhsjtiehsjpiefrcntszm";

// Helper: decode a single-part UR string to its raw CBOR bytes
function urToCbor(ur: string): Uint8Array {
  const decoder = new URDecoder();
  decoder.receivePart(ur);
  return new Uint8Array(decoder.resultUR().cbor);
}

describe("parseXpub — UR crypto-hdkey", () => {
  it("parses type and path from ETH key UR", () => {
    const [parsed] = parseXpub({
      type: "crypto-hdkey",
      cbor: urToCbor(ETH_HDKEY_UR),
    });
    expect(parsed.purpose).toBe(44);
    expect(parsed.coinType).toBe(60);
    expect(parsed.type).toBe("xpub");
  });

  it("extracts source-fingerprint", () => {
    const [parsed] = parseXpub({
      type: "crypto-hdkey",
      cbor: urToCbor(ETH_HDKEY_UR),
    });
    expect(parsed.sourceFingerprint).toBe(0x68161a1c);
  });

  it("hdKey can derive child keys", () => {
    const [parsed] = parseXpub({
      type: "crypto-hdkey",
      cbor: urToCbor(ETH_HDKEY_UR),
    });
    const child = parsed.hdKey.deriveChild(0).deriveChild(0);
    expect(child.publicKey).toHaveLength(33);
  });
});

describe("parseXpub — raw base58 xpub", () => {
  it("parses a standard xpub string", () => {
    const xpub =
      "xpub661MyMwAqRbcFtXgS5sYJABqqG9YLmC4Q1Rdap9gSE8NqtwybGhePY2gZ29ESFjqJoCu1Rupje8YtGqsefD265TMg7usUDFdp6W1EGMcet8";
    const [parsed] = parseXpub(xpub);
    expect(parsed.type).toBe("xpub");
    expect(parsed.purpose).toBeUndefined();
    expect(parsed.hdKey).toBeDefined();
  });

  it("rejects garbage input", () => {
    expect(() => parseXpub("not-a-key")).toThrow();
  });
});
