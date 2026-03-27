# Shell Wallet SDK Design

Evolution of the current Shell QR integration into a reusable wallet library with an API shape closer to wagmi, RainbowKit, or WalletConnect-style integrations, while preserving the airgapped QR-wallet model rather than an online provider model.

## Goals

- Let app developers add Shell support by dropping in a provider/context and a small set of UI components.
- Hide the QR protocol details behind a clean public API.
- Allow developers to restrict supported chain/account types during initialization.
- Provide high-level components for connection, account display, message signing, and eventually transaction signing.
- Make a wagmi adapter possible for EVM apps without forcing the core SDK to depend on wagmi.

## Non-Goals

- Pretending Shell behaves exactly like an injected browser wallet.
- Requiring a browser extension, native bridge, or backend service.
- Replacing the low-level protocol library. The current code in `src/lib/` should become the foundation of the SDK.

## Product Shape

Proposed long-term package shape:

```txt
packages/
  core/          protocol, session state, account derivation, sign request/response handling
  react/         context, hooks, and drop-in components
  wagmi/         optional EVM adapter/connector built on top of core
```

Suggested package names:

- `@shell-wallet/core`
- `@shell-wallet/react`
- `@shell-wallet/wagmi`

## Why a Layered Design

The current project contains two different kinds of logic:

1. Protocol logic

- UR decoding/encoding
- CBOR parsing
- xpub parsing
- address derivation
- sign request generation
- signature parsing and verification

2. App/UI logic

- camera scanning
- animated QR display
- React state management
- account selection
- sign flow rendering

These should not live in one package forever.

The protocol layer should be reusable in any environment.
The React layer should make the common case easy.
The wagmi layer should exist only as an adapter for EVM apps that already use wagmi.

## Core SDK Responsibilities

`@shell-wallet/core` should own:

- Parsing `ur:crypto-hdkey` and `ur:crypto-account`
- Deriving supported accounts from scanned exports
- Building EVM sign requests
- Building Bitcoin sign requests
- Parsing EVM signature responses
- Parsing Bitcoin signature responses
- Verifying Bitcoin signature responses locally
- Session state primitives
- Chain/account filtering

This layer should not know about React, DOM, camera APIs, or canvas QR rendering.

## Session Model

The SDK should expose a session object rather than a collection of loosely related utility functions.

Example:

```ts
interface ShellSession {
  id: string;
  fingerprint?: number;
  accounts: ShellAccount[];
  capabilities: ShellCapabilities;
}

interface ShellCapabilities {
  evm: boolean;
  btcLegacy: boolean;
  btcNestedSegwit: boolean;
  btcNativeSegwit: boolean;
}

type ShellAccount =
  | {
      id: string;
      chain: "evm";
      address: string;
      publicKey: string;
      path: "m/44'/60'/0'/0/0";
    }
  | {
      id: string;
      chain: "btc";
      format: "legacy" | "nestedSegwit" | "nativeSegwit";
      address: string;
      publicKey: string;
      path: string;
    };
```

A session is created from a scanned connection QR and then reused by higher-level hooks and components.

## Initialization and Chain Restriction

Chain and account-type restriction should be supported during initialization.

Example config:

```ts
interface ShellProviderConfig {
  appName: string;
  chains?: Array<"evm" | "btc">;
  btcFormats?: Array<"legacy" | "nestedSegwit" | "nativeSegwit">;
  defaultChain?: "evm" | "btc";
  verifyBitcoinMessages?: boolean;
}
```

Examples:

```ts
createShellClient({
  appName: "My dApp",
  chains: ["evm"],
});
```

```ts
createShellClient({
  appName: "My Bitcoin App",
  chains: ["btc"],
  btcFormats: ["nativeSegwit"],
});
```

```ts
createShellClient({
  appName: "Multi-chain App",
  chains: ["evm", "btc"],
  btcFormats: ["legacy", "nestedSegwit", "nativeSegwit"],
});
```

The SDK should filter the scanned accounts according to config so downstream UI components only see supported account types.

## Public Core API

Proposed core API:

```ts
interface ShellClient {
  config: ShellProviderConfig;
  createSession(input: ScannedUR | string): Promise<ShellSession>;
  disconnect(): Promise<void>;
}

interface SignMessageParams {
  accountId: string;
  message: string;
}

interface SignMessageRequest {
  chain: "evm" | "btc";
  qrParts: string[];
  account: ShellAccount;
  message: string;
}

interface ParsedSignatureResult {
  chain: "evm" | "btc";
  signature: string;
  verified?: boolean;
  publicKey?: string;
}
```

Example usage:

```ts
const session = await client.createSession(scannedConnectionUr);

const request = await shellSignMessage(session, {
  accountId: session.accounts[0].id,
  message: "hello from shell",
});

request.qrParts; // render as single or animated QR

const result = await shellParseSignatureResponse(
  session,
  request,
  scannedSignatureUr,
);
```

## React Layer

`@shell-wallet/react` should make this feel like a wallet SDK instead of a protocol toolkit.

### Provider / Context

A provider/context model fits the React layer.

Example:

```tsx
<ShellProvider
  config={{
    appName: "My dApp",
    chains: ["evm", "btc"],
    btcFormats: ["nativeSegwit"],
  }}
>
  <App />
</ShellProvider>
```

The context should manage:

- current session
- connection status
- selected account
- pending sign request
- last parsed signature result
- errors

### Hooks

Suggested hooks:

- `useShell()`
- `useShellSession()`
- `useShellAccounts()`
- `useShellConnect()`
- `useShellSignMessage()`
- later: `useShellSignTransaction()`

Example:

```ts
const { status, session, accounts, disconnect } = useShell();
const { startConnectionScan } = useShellConnect();
const { request, createMessageRequest, parseSignatureResponse } =
  useShellSignMessage();
```

## Drop-In Components

The goal of this layer is a drop-in integration experience.

### 1. Connection Scanner

```tsx
<ShellConnect />
```

Responsibilities:

- open camera
- scan `crypto-hdkey` / `crypto-account`
- create session
- populate context
- show progress for animated inbound URs
- show parse errors without killing the scan session

Optional props:

```ts
interface ShellConnectProps {
  autoStart?: boolean;
  onConnected?: (session: ShellSession) => void;
  allowedChains?: Array<"evm" | "btc">;
}
```

### 2. Account / Address Display

```tsx
<ShellAccounts />
```

or

```tsx
<ShellAddress chain="evm" />
<ShellAddress chain="btc" format="nativeSegwit" />
```

Responsibilities:

- read accounts from context
- optionally filter by chain / BTC format
- render selected or all accounts
- optionally allow selection

### 3. Message Signing Component

```tsx
<ShellSignMessage />
```

Responsibilities:

- accept a message input or render one
- select an account
- build sign request
- render animated outbound QR automatically
- switch into signature scanning mode
- parse and verify the signature response
- emit a final result callback

Possible API:

```ts
interface ShellSignMessageProps {
  accountId?: string;
  chain?: "evm" | "btc";
  message?: string;
  onSigned?: (result: ParsedSignatureResult) => void;
}
```

This component should hide almost all of the current logic in `AddressBook.tsx`.

### 4. Transaction Signing Component

Planned extension:

```tsx
<ShellSignTransaction />
```

For EVM this handles transaction payload QR generation.
For Bitcoin this may later handle PSBT or message/transaction variants depending on Shell support.

## State Machine

Because Shell is not an always-on wallet, the SDK should internally model a small state machine.

Suggested states:

- `idle`
- `awaiting_connection_qr`
- `connected`
- `building_sign_request`
- `awaiting_signature_scan`
- `signature_verified`
- `error`

This avoids every app reinventing local UI state.

## Mapping Current Code to SDK Layers

Current files that belong in `@shell-wallet/core`:

- `src/lib/parseXpub.ts`
- `src/lib/deriveKeys.ts`
- `src/lib/ethSignRequest.ts`
- `src/lib/btcSignRequest.ts`
- `src/lib/ethSignature.ts`
- `src/lib/btcSignature.ts`
- `src/lib/btcMessageVerification.ts`
- `src/lib/cbor.ts`
- `src/lib/urEncoding.ts`
- `src/lib/types.ts`
- `src/lib/bitcoinAddress.ts`
- `src/lib/ethereumAddress.ts`

Current files that belong in `@shell-wallet/react`:

- `src/lib/react/useQRScanner.ts`
- `src/lib/react/QRScanner.tsx`
- higher-level flow components to be extracted from `src/components/AddressBook.tsx`

## Can We Build a wagmi Connector?

Yes. Shell can be exposed as a wallet option in a wagmi-style wallet list. From the dApp's point of view it can sit next to MetaMask, WalletConnect, and Coinbase Wallet as another connector choice. From the user's point of view, clicking `Shell` would open a Shell modal with camera and QR UI instead of opening an extension popup.

Shell is not an injected wallet, but it can still function as a first-class wallet entry if the connector owns the QR UX.

It should still be implemented as an adapter layer, not the foundation.

### User Experience Flow

Conceptually, the flow would be:

1. The dApp renders a wallet list
2. `Shell` appears beside wallets like MetaMask, WalletConnect, Coinbase Wallet, and others
3. The user clicks `Shell`
4. The connector opens a Shell modal instead of opening a browser extension
5. The modal shows the right UI for the current step:

- a connection camera for scanning Shell's export QR
- an animated outbound QR for Shell to scan
- a signature scanner for scanning Shell's response back in

6. The connector resolves the wagmi action only after the QR round-trip completes

Shell can be treated as another wallet entry in the list, while the SDK handles the airgapped QR-based transport.

### What fits well

A wagmi connector can support the EVM side when Shell is modeled as a delayed or offline signer rather than a live injected provider.

Possible responsibilities for `@shell-wallet/wagmi`:

- expose EVM account(s) derived from the scanned Shell export
- support `connect`
- support `disconnect`
- support `getAccounts`
- support `signMessage`
- support `signTypedData` later if supported
- maybe support `sendTransaction` only as a QR signing flow if the app can broadcast separately

This model is closest to a modal-driven wallet integration. The connector would not talk to an always-on provider. It would orchestrate a UI flow and resolve wagmi calls after completion of the QR exchange.

### What does not map perfectly

wagmi assumes a wallet transport/provider model where calls often complete immediately through an online provider. Shell is airgapped and requires user-driven QR scanning steps.

That means the Shell connector would be less like an injected connector and more like a modal-driven connector with asynchronous human interaction in the middle. The UX pattern is still completely viable, but it should be designed more like `select wallet -> open Shell modal -> complete QR flow` than `select wallet -> provider instantly responds`.

That means the wagmi adapter would need to:

- pause on `connect` until a connection QR is scanned
- pause on `signMessage` until a signature QR is scanned back
- open modal UI during those steps
- manage pending request state carefully so the dApp does not lose context mid-flow

So the connector is feasible, but it will feel more like WalletConnect's modal UX than MetaMask's extension UX, even if it appears in the same wallet list.

### Recommended architecture for wagmi support

Build:

1. `@shell-wallet/core`
2. `@shell-wallet/react`
3. `@shell-wallet/wagmi` on top of those

The wagmi package should not reimplement protocol logic. It should reuse the session and sign-request primitives from core.

Implementation structure:

- `@shell-wallet/core` handles parsing, derivation, sign requests, and signature parsing
- `@shell-wallet/react` provides a modal host plus scanner / animated QR components
- `@shell-wallet/wagmi` exposes a connector that asks the React layer to open the Shell modal whenever wagmi calls `connect`, `signMessage`, or later `sendTransaction`

## Possible wagmi Connector Shape

The connector will probably need two pieces:

- a wagmi connector class
- a React-side modal/controller that the connector can signal when it needs user interaction

Pseudo-code:

```ts
class ShellWagmiConnector {
  id = "shell";
  name = "Shell";

  async connect() {
    // open Shell connect modal / scanner
    // wait for crypto-hdkey / crypto-account QR
    // build session
    // return EVM account(s)
  }

  async getAccounts() {
    // return only EVM-compatible accounts
  }

  async signMessage({ message }) {
    // create eth-sign-request UR
    // show animated QR
    // wait for eth-signature QR
    // parse result
    // return signature
  }

  async disconnect() {
    // clear local session state
  }
}
```

The implementation requires a UI bridge so the connector can ask the React layer to open a scanner or modal.

That bridge enables Shell to behave like a normal wallet choice in a wallet list while preserving the QR-based transport under the hood.

## Best Developer Experience

For most developers, the ideal API is probably React-first rather than wagmi-first.

For EVM apps already using wagmi, the target developer experience is:

- Shell shows up as a wallet option in the wallet picker
- clicking it opens a Shell QR modal instead of an extension
- the connector handles the async QR flow internally
- the dApp continues using normal wagmi hooks after connection

Shell should resemble adding MetaMask to a wallet list, except that the interaction surface is a managed camera/QR modal rather than an injected popup.

Example:

```tsx
<ShellProvider config={{ appName: "My dApp", chains: ["evm"] }}>
  <App />
  <ShellModalHost />
</ShellProvider>
```

A wagmi integration can register Shell as one of the available wallet choices, and the modal host handles the QR UI whenever the connector needs user interaction.

The result is a zero-to-working integration path.

For advanced users:

- expose hooks for fully custom UI
- expose the core package for non-React environments
- expose a wagmi connector for existing EVM ecosystems

## Suggested Roadmap

### Phase 1: Extract core

- Move protocol logic from `src/lib/` into `packages/core`
- Add `ShellClient` / `ShellSession` abstractions
- Add account filtering based on config
- Keep tests at the core layer

### Phase 2: React package

- Add `ShellProvider`
- Add `useShell*` hooks
- Add `ShellConnect`
- Add `ShellAccounts`
- Add `ShellSignMessage`
- Move the current app flow into these primitives

### Phase 3: wagmi adapter

- Implement `ShellWagmiConnector` for EVM accounts
- Build modal/scanner UI bridge for `connect` and `signMessage`
- Test against a simple wagmi app

### Phase 4: transaction signing

- Add EVM transaction signing flow
- Add broader Bitcoin transaction/PSBT support if desired
- Add richer session persistence and reconnection flows

## Recommendation

Proposed approach:

- make a protocol-first core package
- add a React context and components that hide the QR mechanics
- allow chain restrictions during initialization
- add a wagmi connector as a separate adapter for EVM use cases

That architecture provides the cleanest adoption path without forcing the system into an online-wallet model that does not fit Shell.

## Sources

- ERC-4527 spec: https://eips.ethereum.org/EIPS/eip-4527
- EIPs mirror/status page for ERC-4527: https://eips-wg.github.io/EIPs/4527/
- wagmi homepage: https://wagmi.sh/
- wagmi connector source example (WalletConnect): https://github.com/wevm/wagmi/blob/main/packages/connectors/src/walletConnect.ts
- RainbowKit docs: https://www.rainbowkit.com/
- Keystone Ethereum QR protocol write-up: https://github.com/KeystoneHQ/Keystone-developer-hub/blob/main/research/ethereum-qr-data-protocol.md
- Keystone UR registry: https://github.com/KeystoneHQ/ur-registry
- Web3Auth wagmi connector package: https://www.npmjs.com/package/@web3auth/web3auth-wagmi-connector
- MetaMask QR keyring package listing: https://libraries.io/npm/%40metamask%2Feth-qr-keyring
