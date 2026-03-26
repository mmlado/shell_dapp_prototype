# Shell dApp Prototype

**Live demo: https://shelldappprototype.vercel.app/**

A web dApp that integrates with the [Shell](https://keyst.one/) hardware wallet entirely via QR codes — no browser extension, no USB, no Bluetooth. Everything goes through the camera.

## What it does

1. **Connect** — scan Shell's QR code to import your extended public keys
2. **Addresses** — displays your derived addresses across all supported derivation paths
3. **Sign** — type a message, tap Sign, scan the animated QR with Shell, then scan Shell's response to receive the signature

Supported key types:

| Key                   | Path               | Address format       |
| --------------------- | ------------------ | -------------------- |
| EVM / Ethereum        | `m/44'/60'/0'/0/0` | EIP-55 checksummed   |
| Bitcoin Legacy        | `m/44'/0'/0'/0/0`  | P2PKH (`1...`)       |
| Bitcoin Nested SegWit | `m/49'/0'/0'/0/0`  | P2SH-P2WPKH (`3...`) |
| Bitcoin Native SegWit | `m/84'/0'/0'/0/0`  | bech32 (`bc1q...`)   |

## Getting started

```bash
npm install
npm run dev
```

Open the local URL in a browser that has camera access. On desktop, allow camera permission when prompted.

## Other commands

```bash
npm test          # run tests (vitest)
npm run build     # production build
npm run lint      # ESLint
npx prettier --write "src/**/*.{ts,tsx,css}"
```

## How it works

Shell speaks [ERC-4527](https://eips.ethereum.org/EIPS/eip-4527) — a QR-based airgapped signer protocol built on Uniform Resources (UR) and CBOR. The dApp:

- Decodes `ur:crypto-hdkey` and `ur:crypto-account` QR codes (including animated multi-part QRs) to extract account-level extended public keys
- Derives addresses locally using `@scure/bip32`
- Encodes `ur:eth-sign-request` and `ur:btc-sign-request` payloads as animated QR codes when needed so longer messages still round-trip
- Verifies scanned Bitcoin signatures against the signed address and message with `bip322-js`
- Decodes `ur:eth-signature` and `ur:btc-signature` responses from Shell

See [docs/integration-guide.md](docs/integration-guide.md) for the full developer integration guide.

## Project structure

```
src/
  lib/                  # framework-agnostic protocol library
    parseXpub.ts        # UR / base58 xpub → ParsedXpub[]
    deriveKeys.ts       # derive addresses from parsed keys
    ethereumAddress.ts  # pubkey → EIP-55 address
    bitcoinAddress.ts   # pubkey → P2PKH / P2WPKH / P2SH-P2WPKH
    ethSignRequest.ts   # build ur:eth-sign-request
    ethSignature.ts     # parse ur:eth-signature
    btcSignRequest.ts   # build ur:btc-sign-request
    btcSignature.ts     # parse ur:btc-signature
    cbor.ts             # minimal CBOR encoder with tag support
    react/              # React hook + QR scanner component
  components/           # app UI
  test/                 # Vitest tests
docs/
  integration-guide.md  # developer guide
```

## Tech stack

- React 19 + TypeScript + Vite
- `@ngraveio/bc-ur` — UR encoding/decoding
- `@scure/bip32` — HD key derivation
- `@noble/hashes` — SHA-256, Keccak-256, RIPEMD-160
- `@scure/base` — base58check, bech32
- `bip322-js` — Bitcoin message verification
- `cborg` — CBOR decoding
- `jsqr` — camera QR decoding
- `qrcode` — QR code rendering
- Vitest — tests

## License

Apache-2.0
