# Shell wagmi Implementation Plan

_Last updated: March 27, 2026_

## Purpose

Concrete implementation plan for a reusable `@shell-wallet/wagmi` package, based on the SDK design and ERC-4527 research documents.

The package structure may also inform non-QR hardware-wallet integrations, but browser transport constraints determine whether the same interaction model is viable.

## Goal

Production-quality wagmi integration in which Shell appears as a wallet option in a wallet list, and selection opens a managed QR/camera flow instead of an injected wallet popup.

Target developer experience:

- install one or more Shell packages
- register the Shell connector beside MetaMask, WalletConnect, and Coinbase Wallet
- mount a modal host once
- let the connector handle connection and signing flows

## Scope

### In scope for v1

- EVM-only wagmi connector
- connection from `crypto-hdkey` or `crypto-account`
- account exposure to wagmi
- `signMessage`
- modal-based QR connection and QR signing flow
- clean cancellation and timeout handling
- React integration for modal/scanner host

### Explicitly out of scope for v1

- Bitcoin support in the wagmi package
- transaction sending or broadcasting
- non-React UI integration in the wagmi package
- typed data signing unless Shell support is fully confirmed and tested
- session persistence across browser restarts

Bitcoin support remains in `core` and `react`, while `wagmi` v1 stays focused on EVM.

## Package Layout

Proposed monorepo layout:

```txt
packages/
  core/
  react/
  wagmi/
```

### `@shell-wallet/core`

Responsibilities:

- parse `crypto-hdkey` and `crypto-account`
- derive EVM accounts
- build `eth-sign-request`
- parse `eth-signature`
- own request IDs and session state models
- expose framework-agnostic APIs

### `@shell-wallet/react`

Responsibilities:

- provide `ShellProvider`
- provide `ShellModalHost`
- provide QR scanner and animated QR renderer
- expose React hooks for connection and signing state
- act as the UI bridge used by the wagmi connector

### `@shell-wallet/wagmi`

Responsibilities:

- export a `shellWallet(...)` helper for wallet lists
- export a `shellConnector(...)` built on wagmi's custom connector API
- connect wagmi actions to the React modal host
- expose only EVM-compatible account and signing actions

## Recommended Public API

### React package

```tsx
<ShellProvider config={{ appName: 'My dApp', chains: ['evm'] }}>
  <App />
  <ShellModalHost />
</ShellProvider>
```

Suggested exports:

- `ShellProvider`
- `ShellModalHost`
- `useShellModalController()`
- `useShellSession()`
- `useShellAccounts()`
- `useShellConnectFlow()`
- `useShellSignMessageFlow()`

### wagmi package

Suggested exports:

```ts
import { shellConnector, shellWallet } from '@shell-wallet/wagmi'
```

Two entry points are proposed:

1. `shellConnector(...)`

For developers wiring wagmi directly.

2. `shellWallet(...)`

For developers wiring RainbowKit or another wallet-list UI.

Example direction:

```ts
const connector = shellConnector({
  projectName: 'My dApp',
  chains: ['evm'],
})
```

And for wallet-list style usage:

```ts
const wallet = shellWallet({
  projectName: 'My dApp',
})
```

## Core Types To Define First

These types should be stabilized early because all three packages depend on them.

```ts
export interface ShellEvmAccount {
  id: string
  chain: 'evm'
  address: `0x${string}`
  publicKey: string
  path: string
}

export interface ShellSession {
  id: string
  fingerprint?: number
  accounts: ShellEvmAccount[]
  connectedAt: number
}

export interface ShellConnectResult {
  session: ShellSession
  accounts: readonly [`0x${string}`, ...`0x${string}`[]] | readonly `0x${string}`[]
}

export interface ShellSignMessageRequest {
  requestId: string
  account: ShellEvmAccount
  message: string
  qrParts: string[]
}

export interface ShellSignMessageResult {
  requestId: string
  signature: `0x${string}`
  address?: `0x${string}`
}
```

## Implementation Phases

### Phase 0: Prepare the Repository

Objective:
Create package boundaries without changing behavior.

Tasks:

- introduce a `packages/` workspace structure
- move reusable protocol code into `packages/core`
- keep the current app using the extracted package internally
- keep tests green during the extraction

Deliverables:

- app still works
- `core` builds independently
- no wagmi code yet

Initial extraction targets from the current repository:

- move `src/lib/parseXpub.ts`
- move `src/lib/deriveKeys.ts`
- move `src/lib/ethSignRequest.ts`
- move `src/lib/ethSignature.ts`
- move `src/lib/cbor.ts`
- move `src/lib/urEncoding.ts`
- move supporting types/helpers used by EVM

Keep Bitcoin files in `core` too, but they do not need to be exposed by `wagmi` initially.

### Phase 1: Harden `@shell-wallet/core`

Objective:
Create a stable framework-agnostic EVM QR signing SDK.

Tasks:

- normalize `createSession(...)` from connection UR input
- normalize `getEvmAccounts(...)`
- normalize `createEthSignRequest(...)`
- normalize `parseEthSignature(...)`
- add explicit request ID matching
- add explicit error types
- add tests for malformed URs, mismatched request IDs, and cancelled flows

Recommended public functions:

- `createSession(input)`
- `getAccounts(session, { chain: 'evm' })`
- `createEthSignRequest(session, { accountId, message })`
- `parseEthSignatureResponse(request, scannedUr)`

Deliverables:

- pure TypeScript core SDK
- no React dependency
- strong tests around protocol correctness

### Phase 2: Build the React Modal Bridge

Objective:
Create the user-interaction layer that the wagmi connector can rely on.

This is the key architectural step. The wagmi connector should not own React state directly. A React-side modal host should run flows and return promises.

Recommended pieces:

- `ShellProvider`
- `ShellModalHost`
- `ShellModalController`
- `useShellModalController()`

### Modal controller shape

Example:

```ts
interface ShellModalController {
  requestConnect(): Promise<ShellConnectResult>
  requestSignMessage(args: {
    account: `0x${string}`
    message: string
  }): Promise<ShellSignMessageResult>
  cancelActiveRequest(): void
}
```

`ShellModalHost` responsibilities:

- render the current modal step
- start camera scanning when needed
- render animated outbound QR when needed
- resolve or reject the pending promise

The wagmi connector calls into this controller.

### UI states to support

At minimum:

- closed
- connecting_scan
- connected_success
- signing_show_qr
- signing_scan_response
- success
- cancelled
- error

### Required UX guarantees

- if the user closes the modal, the connector gets a rejected promise
- if scanning times out, the connector gets a typed timeout error
- if a different request is already active, the controller rejects or queues cleanly
- if the app unmounts the modal host, active requests fail predictably

Deliverables:

- React-only QR flow that can be triggered programmatically
- app demo still works using the same modal infrastructure

### Phase 3: Build `@shell-wallet/wagmi`

Objective:
Expose a custom wagmi connector.

Recommended connector responsibilities:

- `connect()` opens the Shell connect flow
- `disconnect()` clears local session state
- `getAccounts()` returns EVM addresses from the current session
- `isAuthorized()` returns true only when a usable local session exists
- `getProvider()` returns a minimal provider shim if needed by wagmi consumers
- `signMessage()` opens the Shell sign flow and resolves with the signature

### Important design choice

Shell is modeled as a connector with local session state, not as an injected provider.

That means:

- do not try to fake a full `window.ethereum`
- implement only the actions the connector truly supports
- keep transaction broadcasting outside the connector at first

### Minimal v1 connector behavior

- `connect()`
  - asks modal host to scan the connection QR
  - creates a session
  - returns EVM account(s)

- `getAccounts()`
  - returns session accounts

- `signMessage({ message })`
  - asks modal host to render the outbound sign request QR
  - waits for signed response QR
  - returns a hex signature

- `disconnect()`
  - clears session

### Suggested internal connector state

```ts
interface ShellConnectorState {
  session?: ShellSession
  accounts: `0x${string}`[]
  chainId?: number
}
```

Deliverables:

- a wagmi connector usable in a plain wagmi app
- one working demo app proving the round-trip

### Phase 4: Add Wallet-List Integration

Objective:
Make Shell appear as a standard wallet choice in a wallet picker.

Depending on the UI stack, this requires a helper export rather than only the raw connector.

Examples:

- RainbowKit wallet helper
- custom wallet-list object for another wallet picker

The key behavior should be:

- Shell is listed beside MetaMask, WalletConnect, Coinbase Wallet, etc.
- selecting Shell opens the QR modal
- the user never has to manually wire low-level QR logic in app code

Deliverables:

- drop-in wallet entry for at least one wallet-list ecosystem

### Phase 5: Broaden EVM Signing Support

Only after `connect()` and `signMessage()` are reliable.

Potential additions:

- `signTypedData`
- transaction signing
- account switching within the existing Shell session
- optional session persistence

This phase should be gated by real device testing.

## Recommended Milestones

### Milestone 1: Core extraction complete

Success criteria:

- current demo still works
- protocol code lives in `packages/core`
- no regressions in existing tests

### Milestone 2: React modal host complete

Success criteria:

- connection flow can be triggered from a promise-based API
- message signing flow can be triggered from a promise-based API
- cancellation and timeout behavior are deterministic

### Milestone 3: wagmi connector MVP complete

Success criteria:

- works in a minimal wagmi app
- `connect()` returns a usable EVM account
- `signMessage()` completes a full QR round-trip

### Milestone 4: wallet-list integration complete

Success criteria:

- Shell appears as a wallet option in a wallet picker
- selecting it opens the QR flow, not a browser extension

## Key Risks and How To Reduce Them

### Risk 1: Connector and React modal are too tightly coupled

Mitigation:

- define a small modal-controller interface early
- keep the connector dependent on that interface, not on React components directly

### Risk 2: wagmi expectations do not match asynchronous QR flows cleanly

Mitigation:

- keep v1 scope small: `connect`, `getAccounts`, `disconnect`, `signMessage`
- do not attempt full provider compatibility on day one

### Risk 3: request lifecycle bugs

Mitigation:

- every sign flow should have an explicit request ID
- reject stale or mismatched scanned signatures
- add tests for cancellation, duplicate requests, and timeout handling

### Risk 4: trying to solve BTC and EVM at the same time in wagmi

Mitigation:

- keep Bitcoin in core
- keep `@shell-wallet/wagmi` EVM-only in v1

## Concrete First Tasks

Implementation sequence from the current repository:

1. Create `packages/core` and move the EVM QR protocol code into it.
2. Add a thin `createSession` and `createEthSignRequest` public API around the extracted helpers.
3. Create `packages/react` with `ShellProvider` and a promise-based `ShellModalHost`.
4. Refactor the current app to use the new modal/controller path.
5. Create `packages/wagmi` with a minimal `shellConnector()` supporting `connect`, `getAccounts`, `disconnect`, and `signMessage`.
6. Build a tiny demo app using wagmi and prove end-to-end connection plus message signing.
7. Only then add wallet-list helpers for RainbowKit or similar.

## Minimal Demo Definition

The first demo should prove only this:

- a wagmi app shows `Shell` in the wallet list
- clicking `Shell` opens a QR connection modal
- scanning the device export returns an EVM account
- clicking "Sign message" opens the outbound QR and signature scanner flow
- the app receives a valid signature through wagmi

A clean result validates the architecture.

## Recommendation

Priority should be given to `@shell-wallet/wagmi`, because the QR-based browser interaction model is already established in the current repository.

Reason:

- this repo already contains the working protocol logic
- the architecture can be validated quickly
- once the connector shape is proven, the same package split can inform transport-specific integrations for other hardware wallets

Summary path:

- extract `core`
- build the React modal bridge
- ship a narrow wagmi MVP
- prove the QR wallet-list experience in a demo
- broaden support only after that path is solid

## Sources

- ERC-4527 spec: https://eips.ethereum.org/EIPS/eip-4527
- EIPs mirror/status page for ERC-4527: https://eips-wg.github.io/EIPs/4527/
- wagmi homepage: https://wagmi.sh/
- wagmi connector source example (WalletConnect): https://github.com/wevm/wagmi/blob/main/packages/connectors/src/walletConnect.ts
- Web3Auth wagmi connector package: https://www.npmjs.com/package/@web3auth/web3auth-wagmi-connector
- Keystone Ethereum QR protocol write-up: https://github.com/KeystoneHQ/Keystone-developer-hub/blob/main/research/ethereum-qr-data-protocol.md
- Keystone UR registry: https://github.com/KeystoneHQ/ur-registry
- Existing repo design doc: ./shell-wallet-sdk-design.md
- Existing repo research doc: ./eip-4527-wagmi-research.md
