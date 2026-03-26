import { encode, CborTag } from "./cbor";
import { encodeURFirstPart, encodeURParts } from "./urEncoding";

// btc-data-type: btc-message = 1
const BTC_DATA_TYPE_MESSAGE = 1;

// CBOR tag for crypto-keypath
const TAG_KEYPATH = 304;

export type BtcKeyType = "btcLegacy" | "btcNestedSegwit" | "btcNativeSegwit";

const BTC_PATHS: Record<BtcKeyType, [number, number]> = {
  btcLegacy: [44, 0],
  btcNestedSegwit: [49, 0],
  btcNativeSegwit: [84, 0],
};

function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return buf;
}

function buildKeypath(
  purpose: number,
  coinType: number,
  sourceFingerprint: number | undefined,
): CborTag {
  // m/purpose'/coinType'/0'/0/0
  const components = [
    purpose,
    true,
    coinType,
    true,
    0,
    true,
    0,
    false,
    0,
    false,
  ];
  const keypathMap = new Map<number, unknown>([[1, components]]);
  if (sourceFingerprint !== undefined) {
    keypathMap.set(2, sourceFingerprint);
  }
  return new CborTag(TAG_KEYPATH, keypathMap);
}

function buildBtcSignRequestCbor(
  message: string,
  address: string,
  keyType: BtcKeyType,
  sourceFingerprint: number | undefined,
): Uint8Array {
  const [purpose, coinType] = BTC_PATHS[keyType];
  const requestId = randomBytes(16);
  const messageBytes = new TextEncoder().encode(message);
  const keypath = buildKeypath(purpose, coinType, sourceFingerprint);

  const map = new Map<number, unknown>([
    [1, new CborTag(37, requestId)], // request-id: uuid
    [2, messageBytes], // sign-data
    [3, BTC_DATA_TYPE_MESSAGE], // data-type: btc-message
    [4, [keypath]], // btc-derivation-paths (array of keypath)
    [5, [address]], // btc-addresses (array of text)
    [6, "shell-dapp"], // btc-origin
  ]);

  return encode(map);
}

export function buildBtcSignRequestURParts(
  message: string,
  address: string,
  keyType: BtcKeyType,
  sourceFingerprint: number | undefined,
): string[] {
  return encodeURParts(
    buildBtcSignRequestCbor(message, address, keyType, sourceFingerprint),
    "btc-sign-request",
  );
}

export function buildBtcSignRequestUR(
  message: string,
  address: string,
  keyType: BtcKeyType,
  sourceFingerprint: number | undefined,
): string {
  return encodeURFirstPart(
    buildBtcSignRequestCbor(message, address, keyType, sourceFingerprint),
    "btc-sign-request",
  );
}
