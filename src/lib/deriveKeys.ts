import type { HDKey } from "@scure/bip32";
import { pubKeyToEthAddress } from "./ethereumAddress";
import {
  pubKeyToLegacyAddress,
  pubKeyToNestedSegwitAddress,
  pubKeyToNativeSegwitAddress,
} from "./bitcoinAddress";
import type { ParsedXpub } from "./parseXpub";

export interface DerivedKeys {
  evm: string | null;
  btcLegacy: string | null;
  btcNestedSegwit: string | null;
  btcNativeSegwit: string | null;
  /** Source fingerprint from the scanned xpub — required by Shell for signing */
  sourceFingerprint: number | undefined;
}

// Derive the first external address (index 0) from an account-level xpub.
// Account-level xpub is at depth 3 (m/purpose'/coin'/account').
// External chain is child 0, then address index 0.
function firstAddress(
  accountKey: HDKey,
  addrFn: (pub: Uint8Array) => string,
): string {
  const external = accountKey.deriveChild(0); // /0 = external chain
  const addr = external.deriveChild(0); // /0 = first address
  return addrFn(addr.publicKey!);
}

function deriveOne(parsed: ParsedXpub, result: DerivedKeys): void {
  const { hdKey, purpose, coinType, type } = parsed;

  if (purpose === 44 && coinType === 60) {
    result.evm = firstAddress(hdKey, pubKeyToEthAddress);
  } else if (purpose === 44 && coinType === 0) {
    result.btcLegacy = firstAddress(hdKey, pubKeyToLegacyAddress);
  } else if (purpose === 49) {
    result.btcNestedSegwit = firstAddress(hdKey, pubKeyToNestedSegwitAddress);
  } else if (purpose === 84) {
    result.btcNativeSegwit = firstAddress(hdKey, pubKeyToNativeSegwitAddress);
  } else if (purpose === undefined) {
    // Raw xpub — fall back to version byte heuristic
    if (type === "xpub") result.evm = firstAddress(hdKey, pubKeyToEthAddress);
    else if (type === "ypub")
      result.btcNestedSegwit = firstAddress(hdKey, pubKeyToNestedSegwitAddress);
    else if (type === "zpub")
      result.btcNativeSegwit = firstAddress(hdKey, pubKeyToNativeSegwitAddress);
  }
}

export function deriveKeys(parsed: ParsedXpub[]): DerivedKeys {
  const result: DerivedKeys = {
    evm: null,
    btcLegacy: null,
    btcNestedSegwit: null,
    btcNativeSegwit: null,
    sourceFingerprint: parsed[0]?.sourceFingerprint,
  };
  for (const entry of parsed) {
    deriveOne(entry, result);
    // Use the ETH key's fingerprint if available
    if (
      entry.purpose === 44 &&
      entry.coinType === 60 &&
      entry.sourceFingerprint !== undefined
    ) {
      result.sourceFingerprint = entry.sourceFingerprint;
    }
  }
  return result;
}
