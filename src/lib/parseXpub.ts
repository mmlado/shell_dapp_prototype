import { HDKey } from "@scure/bip32";
import { base58check } from "@scure/base";
import { sha256 } from "@noble/hashes/sha2.js";
import { decode as cborDecode, type TagDecoder } from "cborg";
import type { ScannedUR } from "./types";

// Version bytes for extended public keys
const XPUB_VERSION = 0x0488b21e; // BIP-44 / generic
const YPUB_VERSION = 0x049d7cb2; // BIP-49 nested SegWit
const ZPUB_VERSION = 0x04b24746; // BIP-84 native SegWit

export type XpubType = "xpub" | "ypub" | "zpub";

export interface ParsedXpub {
  hdKey: HDKey;
  type: XpubType;
  /** BIP-44 purpose index: 44, 49, or 84 */
  purpose: number | undefined;
  /** BIP-44 coin type: 60 = ETH, 0 = BTC */
  coinType: number | undefined;
  /** source-fingerprint from the origin keypath — required by Shell for signing */
  sourceFingerprint: number | undefined;
  raw: string;
}

function typeFromPurpose(purpose: number | undefined): XpubType {
  if (purpose === 49) return "ypub";
  if (purpose === 84) return "zpub";
  return "xpub";
}

// cborg with useMaps:true decodes CBOR maps as JS Map with integer keys
function get(m: unknown, k: number): unknown {
  if (m instanceof Map) return (m as Map<number, unknown>).get(k);
  return undefined;
}

const passthrough = (v: unknown) => v;

function decodeCbor(cbor: Uint8Array): Map<number, unknown> {
  return cborDecode(cbor, {
    useMaps: true,
    tags: Object.assign([] as TagDecoder[], {
      303: passthrough, // crypto-hdkey
      304: passthrough, // crypto-keypath
      305: passthrough, // crypto-coin-info
      400: passthrough, // crypto-output P2SH
      401: passthrough, // crypto-output P2PK
      402: passthrough, // crypto-output P2PKH
      403: passthrough, // crypto-output P2SH-P2WPKH
      404: passthrough, // crypto-output P2WPKH
      405: passthrough, // crypto-output P2WSH
      406: passthrough, // crypto-output P2SH-P2WSH
      407: passthrough,
      408: passthrough,
      409: passthrough,
      410: passthrough,
      411: passthrough,
      412: passthrough,
    }),
  }) as Map<number, unknown>;
}

function parseCryptoHdKey(map: unknown, raw: string): ParsedXpub {
  const keyData = get(map, 3) as Uint8Array | undefined;
  const chainCode = get(map, 4) as Uint8Array | undefined;

  if (!keyData || !chainCode) {
    throw new Error("crypto-hdkey missing key-data or chain-code");
  }

  // origin: map key 6 → crypto-keypath Map
  // components: [purpose, hardened, coinType, hardened, account, hardened]
  // source-fingerprint: map key 2 — required by Shell to validate the card
  let purpose: number | undefined;
  let coinType: number | undefined;
  let sourceFingerprint: number | undefined;
  const origin = get(map, 6);
  if (origin) {
    const components = get(origin, 1);
    if (Array.isArray(components)) {
      if (components.length >= 1) purpose = components[0] as number;
      if (components.length >= 3) coinType = components[2] as number;
    }
    sourceFingerprint = get(origin, 2) as number | undefined;
  }

  const hdKey = new HDKey({ publicKey: keyData, chainCode });
  const type = typeFromPurpose(purpose);
  return { hdKey, type, purpose, coinType, sourceFingerprint, raw };
}

function parseScannedUR(scanned: ScannedUR): ParsedXpub | ParsedXpub[] {
  const { type, cbor } = scanned;
  const raw = `ur:${type}`;

  if (type !== "crypto-hdkey" && type !== "crypto-account") {
    throw new Error(`Unsupported UR type: ${type}`);
  }

  const map = decodeCbor(cbor);

  if (type === "crypto-hdkey") {
    return parseCryptoHdKey(map, raw);
  }

  // crypto-account: key 2 = array of crypto-hdkey entries (one per derivation path)
  const accounts = map.get(2) as unknown[] | undefined;
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error("crypto-account contains no keys");
  }
  return accounts.map((entry) => parseCryptoHdKey(entry, raw));
}

function parseRawXpub(input: string): ParsedXpub {
  const decoded = base58check(sha256).decode(input);
  if (decoded.length !== 78) {
    throw new Error(`Invalid extended key length: ${decoded.length}`);
  }

  const version =
    (decoded[0] << 24) | (decoded[1] << 16) | (decoded[2] << 8) | decoded[3];

  let type: XpubType;
  if (version === YPUB_VERSION) {
    type = "ypub";
  } else if (version === ZPUB_VERSION) {
    type = "zpub";
  } else {
    type = "xpub";
  }

  let base58ForParsing = input;
  if (type !== "xpub") {
    const normalized = new Uint8Array(decoded);
    normalized[0] = (XPUB_VERSION >> 24) & 0xff;
    normalized[1] = (XPUB_VERSION >> 16) & 0xff;
    normalized[2] = (XPUB_VERSION >> 8) & 0xff;
    normalized[3] = XPUB_VERSION & 0xff;
    base58ForParsing = base58check(sha256).encode(normalized);
  }

  const hdKey = HDKey.fromExtendedKey(base58ForParsing);
  return {
    hdKey,
    type,
    purpose: undefined,
    coinType: undefined,
    sourceFingerprint: undefined,
    raw: input,
  };
}

export function parseXpub(input: ScannedUR | string): ParsedXpub[] {
  if (typeof input !== "string") {
    const result = parseScannedUR(input);
    return Array.isArray(result) ? result : [result];
  }
  return [parseRawXpub(input.trim())];
}
