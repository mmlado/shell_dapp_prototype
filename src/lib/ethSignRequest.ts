import { encode, CborTag } from "./cbor";
import { encodeURFirstPart, encodeURParts } from "./urEncoding";

// EIP-191 personal_sign = eth-raw-bytes (Shell/ERC-4527 data type 3)
const DATA_TYPE_ETH_RAW_BYTES = 3;

// CBOR tag for crypto-keypath
const TAG_KEYPATH = 304;

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
    keypathMap.set(2, sourceFingerprint); // source-fingerprint — Shell requires this
  }
  return new CborTag(TAG_KEYPATH, keypathMap);
}

function buildEthSignRequestCbor(
  message: string,
  address: string,
  sourceFingerprint: number | undefined,
): Uint8Array {
  const requestId = randomBytes(16);
  const messageBytes = new TextEncoder().encode(message);
  const keypath = buildKeypath(44, 60, sourceFingerprint);

  // Parse address bytes (strip 0x, take 20 bytes)
  const addrHex = address.replace(/^0x/i, "");
  const addrBytes = new Uint8Array(
    addrHex.match(/.{2}/g)!.map((b) => parseInt(b, 16)),
  );

  const map = new Map<number, unknown>([
    [1, new CborTag(37, requestId)], // request-id: uuid = #6.37(bstr)
    [2, messageBytes], // sign-data
    [3, DATA_TYPE_ETH_RAW_BYTES], // data-type: eth-raw-bytes for EIP-191
    [5, keypath], // derivation-path
    [6, addrBytes], // address
    [7, "shell-dapp"], // origin
  ]);

  return encode(map);
}

export function buildEthSignRequestURParts(
  message: string,
  address: string,
  sourceFingerprint: number | undefined,
): string[] {
  return encodeURParts(
    buildEthSignRequestCbor(message, address, sourceFingerprint),
    "eth-sign-request",
  );
}

export function buildEthSignRequestUR(
  message: string,
  address: string,
  sourceFingerprint: number | undefined,
): string {
  return encodeURFirstPart(
    buildEthSignRequestCbor(message, address, sourceFingerprint),
    "eth-sign-request",
  );
}
