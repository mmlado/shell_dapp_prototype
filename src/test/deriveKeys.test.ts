import { describe, it, expect } from "vitest";
import { URDecoder } from "@ngraveio/bc-ur";
import { parseXpub } from "../lib/parseXpub";
import { deriveKeys } from "../lib/deriveKeys";

const ETH_HDKEY_UR =
  "ur:crypto-hdkey/osaowkaxhdclaojyhdtidmwprpltktftfefxmymottrfndlbiofwehbdgsbwgeglkstsembgkklfgsaahdcxghnbrsbzylkeiyuecfmwnlbggwhtkownwdeylahgjsykwshecxmhamsfecvtdeyaamtaaddyotadlncsdwykcsfnykaeykaocyiscmcyceaxaxaycylebgmkbzasjngrihkkiahsjpiecxguisihjzjzbkjohsiaiajlkpjtjydmjkjyhsjtiehsjpiefrcntszm";

function urToCbor(ur: string): Uint8Array {
  const decoder = new URDecoder();
  decoder.receivePart(ur);
  return new Uint8Array(decoder.resultUR().cbor);
}

describe("deriveKeys", () => {
  it("derives ETH address from m/44'/60' xpub", () => {
    const parsed = parseXpub({
      type: "crypto-hdkey",
      cbor: urToCbor(ETH_HDKEY_UR),
    });
    const keys = deriveKeys(parsed);
    // Known address derived from the real Shell device key
    expect(keys.evm).toBe("0xa786EC7488a340964fc4a0367144436bEb7904cE");
    expect(keys.btcLegacy).toBeNull();
    expect(keys.btcNativeSegwit).toBeNull();
    expect(keys.btcNestedSegwit).toBeNull();
  });

  it("only populates the address type matching the key's path", () => {
    const parsed = parseXpub({
      type: "crypto-hdkey",
      cbor: urToCbor(ETH_HDKEY_UR),
    });
    const keys = deriveKeys(parsed);
    const nonNull = [
      keys.evm,
      keys.btcLegacy,
      keys.btcNativeSegwit,
      keys.btcNestedSegwit,
    ].filter(Boolean);
    expect(nonNull).toHaveLength(1);
  });

  it("carries source-fingerprint through", () => {
    const parsed = parseXpub({
      type: "crypto-hdkey",
      cbor: urToCbor(ETH_HDKEY_UR),
    });
    const keys = deriveKeys(parsed);
    expect(keys.sourceFingerprint).toBe(0x68161a1c);
  });
});
