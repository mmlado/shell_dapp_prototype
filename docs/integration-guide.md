# Shell dApp Integration Guide

This guide explains how to integrate a web dApp with the Shell hardware wallet using QR codes. The entire interaction is airgapped — data enters and leaves Shell only via QR codes.

## Overview

The integration has two phases:

1. **Connect** — scan a QR code from Shell to receive the user's extended public keys
2. **Sign** — display a QR code for Shell to scan, then scan Shell's QR response to receive the signature

Shell speaks [ERC-4527](https://eips.ethereum.org/EIPS/eip-4527), which uses **Uniform Resources (UR)** — a self-describing, CBOR-encoded, optionally animated QR format. You do not need the Keystone SDK; this guide shows how to implement the protocol directly with minimal dependencies.

## Dependencies

```
@ngraveio/bc-ur    — UR encoding / decoding, animated QR support
@scure/bip32       — HD key derivation from extended public keys
@noble/hashes      — SHA-256, Keccak-256, RIPEMD-160
@scure/base        — base58check and bech32 encoding
cborg              — CBOR decoding (browser-safe, no Node.js Buffer required)
qrcode             — render QR codes to canvas
jsqr               — decode QR frames from camera
```

## Connection Flow

### 1. Presenting the "Export" prompt on Shell

Shell presents a QR code when the user navigates to **Settings → Sync** (or equivalent on device). The QR contains one of two UR types depending on the Shell firmware:

| UR type             | Contents                                              |
| ------------------- | ----------------------------------------------------- |
| `ur:crypto-hdkey`   | Single account-level extended public key              |
| `ur:crypto-account` | Multiple extended public keys across derivation paths |

### 2. Scanning the QR in the dApp

Use `URDecoder` from `@ngraveio/bc-ur` to handle both single-frame and animated (multi-part) QR codes. **Create one decoder per scan session and reuse it across frames** — multi-part QRs require the decoder to accumulate parts.

```ts
import { URDecoder } from "@ngraveio/bc-ur";

const decoder = new URDecoder();

// Called for each decoded QR frame (e.g. from jsqr)
function onFrame(data: string) {
  decoder.receivePart(data.toLowerCase()); // UR is case-insensitive; normalise to lower
  if (!decoder.isComplete()) return; // more parts expected
  const ur = decoder.resultUR();
  handleScanned({ type: ur.type, cbor: new Uint8Array(ur.cbor) });
}
```

> **Animated QR**: Shell may split large payloads across multiple QR frames. The frames cycle continuously; the decoder collects them until all parts are received. Expose a progress indicator (`decoder.getProgress()`) so the user knows to keep scanning.

### 3. Parsing the extended public key

After scanning you have a `ScannedUR` with `type` and `cbor` fields. Pass it to `parseXpub`:

```ts
import { parseXpub } from "./src/lib/parseXpub";

const keys = parseXpub(scannedUR); // ParsedXpub[]
```

`parseXpub` also accepts a raw base58 xpub/ypub/zpub string for testing:

```ts
const keys = parseXpub("xpub661MyMwAq...");
```

Each `ParsedXpub` contains:

| Field               | Type                         | Description                                       |
| ------------------- | ---------------------------- | ------------------------------------------------- |
| `hdKey`             | `HDKey`                      | @scure/bip32 key ready for derivation             |
| `type`              | `'xpub' \| 'ypub' \| 'zpub'` | Version byte hint                                 |
| `purpose`           | `number \| undefined`        | BIP-44 purpose index (44, 49, or 84)              |
| `coinType`          | `number \| undefined`        | 60 = EVM, 0 = Bitcoin                             |
| `sourceFingerprint` | `number \| undefined`        | **Must be included in sign requests** (see below) |

### 4. Deriving addresses

```ts
import { deriveKeys } from "./src/lib/deriveKeys";

const derived = deriveKeys(keys);
// derived.evm             — EIP-55 checksummed Ethereum address or null
// derived.btcLegacy       — P2PKH address or null
// derived.btcNestedSegwit — P2SH-P2WPKH address or null
// derived.btcNativeSegwit — bech32 P2WPKH address or null
// derived.sourceFingerprint — carry this into sign requests
```

`deriveKeys` inspects `purpose` and `coinType` from each `ParsedXpub` to decide which address type to derive. Only the key types actually present in the scanned UR will be non-null.

Address derivation follows the standard account-level path:

```
m/purpose'/coinType'/0'/0/0
               ^^^
               account-level xpub starts here
               derive /0 (external chain) then /0 (first address)
```

## Signing Flow (EVM — EIP-191 personal_sign)

### 1. Build the sign request UR

```ts
import { buildEthSignRequestUR } from "./src/lib/ethSignRequest";

const ur = buildEthSignRequestUR(
  message, // UTF-8 string
  derived.evm, // EIP-55 address
  derived.sourceFingerprint, // REQUIRED — Shell validates this against the inserted card
);
```

The function returns a single-part `UR:ETH-SIGN-REQUEST` string. Render it as a QR code:

```ts
import QRCode from "qrcode";

QRCode.toCanvas(canvasElement, ur, {
  errorCorrectionLevel: "L",
  margin: 3,
  width: 380,
  color: { dark: "#000000", light: "#ffffff" },
});
```

> **White background is required.** Shell's QR scanner expects high-contrast light background. Always set `light: '#ffffff'` and ensure no dark overlay is applied to the canvas.

### 2. What the sign request contains

The `ur:eth-sign-request` CBOR map follows ERC-4527:

| CBOR key | Value                                                      |
| -------- | ---------------------------------------------------------- |
| 1        | request-id: `#6.37(bytes)` — UUID wrapped in CBOR tag 37   |
| 2        | sign-data: raw UTF-8 bytes of the message                  |
| 3        | data-type: **3** (`eth-raw-bytes`) — EIP-191 personal_sign |
| 5        | derivation-path: `crypto-keypath` with source-fingerprint  |
| 6        | address: 20 raw bytes (no 0x prefix)                       |
| 7        | origin: string label (e.g. `"shell-dapp"`)                 |

> **data-type must be 3, not 1.** Type 1 is `eth-transaction-data`; Shell will reject it for message signing. EIP-191 `personal_sign` maps to type 3 (`eth-raw-bytes`).

### 3. source-fingerprint is mandatory

Shell verifies that the `source-fingerprint` in the keypath of the sign request matches the fingerprint of the currently inserted card. If it is missing or wrong, Shell returns a "wrong keypair" error.

The fingerprint is included in the scanned `crypto-hdkey` origin keypath (CBOR map key 2 inside the keypath structure). `parseXpub` extracts it automatically and `buildEthSignRequestUR` includes it.

### 4. Scan Shell's signature response

After Shell signs, it presents a `ur:eth-signature` QR code. Scan it the same way as the connection QR (reuse `URDecoder`), then parse:

```ts
import { parseEthSignature } from "./src/lib/ethSignature";

const signature = parseEthSignature(scannedUR);
// "0x<130 hex chars>" — 65-byte r+s+v
```

## Signing Flow (Bitcoin — message signing)

### 1. Build the sign request UR

```ts
import {
  buildBtcSignRequestUR,
  type BtcKeyType,
} from "./src/lib/btcSignRequest";

const keyType: BtcKeyType = "btcNativeSegwit"; // or "btcLegacy" / "btcNestedSegwit"

const ur = buildBtcSignRequestUR(
  message, // UTF-8 string
  derived.btcNativeSegwit, // address string
  keyType,
  derived.sourceFingerprint, // REQUIRED — same requirement as EVM
);
```

Render the QR code the same way as the EVM request:

```ts
import QRCode from "qrcode";

QRCode.toCanvas(canvasElement, ur, {
  errorCorrectionLevel: "L",
  margin: 3,
  width: 380,
  color: { dark: "#000000", light: "#ffffff" },
});
```

### 2. What the sign request contains

The `ur:btc-sign-request` CBOR map follows Shell's CDDL:

| CBOR key | Value                                                           |
| -------- | --------------------------------------------------------------- |
| 1        | request-id: `#6.37(bytes)` — UUID wrapped in CBOR tag 37        |
| 2        | sign-data: raw UTF-8 bytes of the message                       |
| 3        | data-type: **1** (`btc-message`)                                |
| 4        | btc-derivation-paths: array of `#6.304(crypto-keypath)`         |
| 5        | btc-addresses: array of address strings (plain text, not bytes) |
| 6        | origin: string label (e.g. `"shell-dapp"`)                      |

Key differences from the EVM request:

- `data-type` is **1**, not 3
- The address is a **text string** (e.g. `"bc1q..."`) not raw bytes
- The derivation path is wrapped in an **array** at key 4

### 3. Scan Shell's signature response

After Shell signs, it presents a `ur:btc-signature` QR code:

```ts
import { parseBtcSignature } from "./src/lib/btcSignature";

const { signature, publicKey } = parseBtcSignature(scannedUR);
// signature  — base64-encoded compact signature (65 bytes)
// publicKey  — hex-encoded compressed public key (33 bytes)
```

The `ur:btc-signature` CBOR map:

| CBOR key | Value                                       |
| -------- | ------------------------------------------- |
| 1        | request-id: UUID (matches the sign request) |
| 2        | signature: raw bytes (base64 after parsing) |
| 3        | public-key: compressed pubkey bytes         |

## CBOR notes

`cborg` is used for decoding throughout. Key configuration:

```ts
import { decode, type TagDecoder } from "cborg";

decode(cbor, {
  useMaps: true, // decode CBOR maps as JS Map<number, unknown>
  tags: Object.assign([] as TagDecoder[], {
    304: (v) => v, // crypto-keypath — pass through as-is
    37: (v) => v, // UUID — pass through as-is
    // 400–412 for crypto-account output descriptors
  }),
});
```

Without `useMaps: true` CBOR integer keys are lost (converted to string). Without tag passthrough for 304/37, decoding throws.

The `tags` option type is `TagDecoder[]` (a sparse array indexed by tag number). Pass `Object.assign([], { ... })` to satisfy TypeScript while using object literal syntax.

For **encoding** (sign requests), a minimal custom CBOR encoder is used (`src/lib/cbor.ts`) because browser-compatible CBOR encoders with tag support are rare. It covers: uint, bytes, text, array, map (integer keys), bool, and `CborTag`.

## Supported UR types

| UR type               | Direction    | Description                           |
| --------------------- | ------------ | ------------------------------------- |
| `ur:crypto-hdkey`     | Shell → dApp | Single extended public key            |
| `ur:crypto-account`   | Shell → dApp | Multiple keys across derivation paths |
| `ur:eth-sign-request` | dApp → Shell | EIP-191 sign request                  |
| `ur:eth-signature`    | Shell → dApp | ECDSA signature response (EVM)        |
| `ur:btc-sign-request` | dApp → Shell | Bitcoin message sign request          |
| `ur:btc-signature`    | Shell → dApp | Bitcoin signature response            |

## Derivation paths

| Path           | Purpose | Address type                                 |
| -------------- | ------- | -------------------------------------------- |
| `m/44'/60'/0'` | EVM     | Ethereum / EIP-55 checksummed                |
| `m/44'/0'/0'`  | Bitcoin | P2PKH (legacy, starts with `1`)              |
| `m/49'/0'/0'`  | Bitcoin | P2SH-P2WPKH (nested SegWit, starts with `3`) |
| `m/84'/0'/0'`  | Bitcoin | P2WPKH (native SegWit, bech32 `bc1q...`)     |

Shell exports account-level keys (depth 3). The dApp derives `/0/0` (first external address) from each.

## Source layout

```
src/lib/
  types.ts            — ScannedUR interface
  parseXpub.ts        — UR / base58 xpub → ParsedXpub[]
  deriveKeys.ts       — ParsedXpub[] → DerivedKeys (addresses + sourceFingerprint)
  ethereumAddress.ts  — compressed pubkey → EIP-55 address
  bitcoinAddress.ts   — compressed pubkey → P2PKH / P2WPKH / P2SH-P2WPKH
  ethSignRequest.ts   — build ur:eth-sign-request string
  ethSignature.ts     — parse ur:eth-signature → 0x hex string
  btcSignRequest.ts   — build ur:btc-sign-request string
  btcSignature.ts     — parse ur:btc-signature → base64 sig + hex pubkey
  cbor.ts             — minimal CBOR encoder with CborTag support
  react/
    useQRScanner.ts   — camera + jsqr + URDecoder hook
    QRScanner.tsx     — camera overlay component
  index.ts            — library entry point
```

## Polyfills

`@ngraveio/bc-ur` expects a global `Buffer`. Add this before any imports in your entry point:

```ts
import { Buffer } from "buffer";
(globalThis as unknown as Record<string, unknown>).Buffer = Buffer;
```

If bundling with Vite, also add to your config:

```ts
define: { "process.env": {} }
```
