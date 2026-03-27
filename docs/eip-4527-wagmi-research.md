# EIP-4527 and wagmi Research

_Last updated: March 27, 2026_

## Question

Integration of an [ERC-4527](https://eips.ethereum.org/EIPS/eip-4527) QR-based airgapped wallet into `wagmi`, and identification of existing projects relevant to Shell and other hardware-wallet integrations.

## Summary

ERC-4527 support in wagmi appears feasible through a custom connector architecture.

`wagmi` does not appear to ship built-in ERC-4527 support, and no widely adopted off-the-shelf ERC-4527 wagmi connector was identified in this research. However, `wagmi` is extensible enough to support one, and there are already adjacent building blocks in the ecosystem:

- ERC-4527 itself standardizes the QR flow and payload types.
- `wagmi` supports custom connectors.
- WalletConnect and Web3Auth demonstrate that modal-driven connectors fit well into the wagmi model.
- MetaMask and Keystone already prove that QR-based EVM hardware-wallet flows are viable in production, even though they are not exposed as a generic wagmi connector.
- Keystone publishes UR/EIP-4527-adjacent libraries and protocol documentation that form a strong public starting point.

Conclusions:

- there is a clear path to build `@shell-wallet/wagmi`
- there is not much evidence of an existing maintained ERC-4527 wagmi connector available for direct installation today
- one expansion path is a custom wagmi connector on top of a protocol-focused core SDK

## What ERC-4527 Actually Standardizes

ERC-4527 defines a QR-based process between a watch-only wallet and an offline signer:

1. the signer exports public-key information via QR
2. the watch-only wallet builds unsigned payloads
3. the watch-only wallet sends signing requests via QR
4. the signer returns signatures via QR
5. the watch-only wallet constructs and broadcasts the final transaction or uses the signature

It also standardizes the relevant UR types and payloads for Ethereum, including:

- `crypto-hdkey`
- `crypto-account`
- `eth-sign-request`
- `eth-signature`

The spec explicitly expects animated QR codes for larger payloads and uses UR + CBOR for transport.

The protocol maps naturally to the architecture demonstrated in this repository.

## Does wagmi Support This Model?

Not directly, but the connector model is flexible enough.

`wagmi` is built around connectors. In the common case those connectors talk to:

- injected wallets like MetaMask
- remote session protocols like WalletConnect
- SDK-backed wallets such as Web3Auth

An ERC-4527 wallet would be different in transport, but not different in the high-level lifecycle:

1. connect
2. get accounts
3. sign message / typed data / transaction
4. disconnect

The main difference is that each of those actions can require a modal QR/camera round-trip rather than a direct RPC call to an online provider.

An ERC-4527 connector for wagmi is feasible, but it is better modeled as:

- a modal-driven connector
- with asynchronous human interaction in the middle
- backed by local session state instead of an injected provider

## wagmi Ecosystem Findings

### 1. wagmi clearly supports custom connectors

No official wagmi documentation was identified in this pass stating that "ERC-4527 is supported", but there is strong evidence that custom connectors are the intended extension point:

- the `wagmi` project exposes connector packages and connector source code
- community examples use `createConnector(...)` for unsupported wallets and environments
- third-party packages already exist for non-standard wallet flows

Examples:

- WalletConnect's official wagmi connector exists as a separate connector implementation in the wagmi codebase
- Web3Auth publishes a wagmi connector package
- wagmi discussions explicitly talk about custom connectors and mocking connectors with `createConnector(...)`

The most important technical conclusion is that wagmi core does not need to change in order to add ERC-4527 support. A separate connector package is a normal pattern.

### 2. Modal-driven connectors already fit the wagmi mental model

WalletConnect is a relevant comparison point.

WalletConnect is not an injected browser wallet, but from the dApp's perspective it still appears as a wallet option and opens its own UI flow. That is very close to what an ERC-4527 connector would do:

- WalletConnect opens a modal/session flow
- an ERC-4527 connector would open a camera/QR modal flow

That does not make the implementations identical, but it is strong evidence that wagmi is comfortable with connectors that are not simple `window.ethereum` wrappers.

### 3. There does not seem to be a known generic ERC-4527 wagmi connector already

As of March 27, 2026, no broadly used package matching the following patterns was identified:

- `wagmi-erc4527-connector`
- `keystone-wagmi-connector`
- `airgapped-wagmi-connector`

This is an inference from public search results, not proof of absence. Based on the available evidence, the space remains open.

## Existing Relevant Solutions

### 1. Keystone's protocol and SDK ecosystem

This is a strong public starting point.

Relevant pieces:

- Keystone's original Ethereum QR protocol write-up closely matches what later became ERC-4527
- Keystone's developer hub references `ur-registry-eth` as the reference implementation and test cases for the EIP
- Keystone maintains UR registry tooling and SDK repositories
- Keystone has web/base SDK repos that support implementations based on their abstractions instead of raw UR parsing

Relevant characteristics:

- Keystone is one of the clearest public implementers of the protocol family behind ERC-4527
- their libraries may save time around UR models, CBOR payload definitions, and interoperability
- even without a direct SDK dependency, their registries and docs provide compatibility references

For non-QR hardware wallets, two paths emerge:

- build a wallet-native core SDK and verify payload compatibility against Keystone's protocol material
- or fork/adapt parts of Keystone's SDK stack where the abstractions are clean enough

### 2. Third-party wagmi connectors like Web3Auth

Web3Auth's wagmi connector is not related to ERC-4527, but it is strong evidence for product shape.

It shows that:

- a third-party team can publish a standalone wagmi connector package
- that connector can wrap a separate SDK
- the connector can own user interaction and still feel native to wagmi apps

That is the relevant packaging pattern:

- `@shell-wallet/core`
- `@shell-wallet/react`
- `@shell-wallet/wagmi`
- corresponding transport-specific packages for non-QR hardware wallets where applicable

## Architecture for Shell and Related Hardware-Wallet Integrations

The cleanest model still looks like a three-layer design:

```txt
packages/
  core/
  react/
  wagmi/
```

### `core`

Responsibilities:

- parse `crypto-hdkey` / `crypto-account`
- derive accounts
- build `eth-sign-request`
- parse `eth-signature`
- manage request IDs and local session state
- optionally verify returned signer/address alignment

The current repository already covers this area well.

### `react`

Responsibilities:

- camera scanning
- animated QR rendering
- modal host
- provider/context
- hooks and drop-in components

This is what bridges protocol logic into app UX.

### `wagmi`

Responsibilities:

- expose a custom connector
- call into the React modal host when user interaction is needed
- return EVM accounts to wagmi
- implement `connect`, `disconnect`, `getAccounts`, `signMessage`
- later add `signTypedData` and transaction signing

This is the thin adapter layer.

## What a wagmi Connector Would Need To Do

A QR-based Shell wagmi connector requires:

- cached local session state
- a way to open a modal from connector actions
- a way to await results from QR scanning
- account filtering for EVM-only exposure
- careful handling of cancellation and timeouts

Pseudo-shape:

```ts
class Erc4527Connector {
  id = 'shell'
  name = 'Shell'

  async connect() {
    // open connection scanner modal
    // wait for crypto-hdkey / crypto-account
    // create session
    // return EVM accounts
  }

  async getAccounts() {
    // return EVM accounts from the saved session
  }

  async signMessage({ message }) {
    // build eth-sign-request
    // show animated outbound QR
    // switch modal into scanner mode
    // parse eth-signature
    // return signature hex
  }

  async disconnect() {
    // clear local session state
  }
}
```

The important design point is that the connector should not contain the full QR/protocol implementation. It should delegate to the core/react layers.

## Best Existing Starting Points by Goal

### If the goal is "ship a wagmi integration for Shell"

Primary starting point:

- the existing protocol code in this repository
- plus a new custom wagmi connector

Rationale:

- the airgapped UX assumptions are already under direct control
- browser-safe QR and UR handling already exists
- Keystone- or MetaMask-specific abstractions are not required

### If the goal is "maximize interoperability with the existing ERC-4527/Keystone ecosystem"

Primary starting point:

- Keystone protocol docs
- `ur-registry-eth`
- Keystone UR registry / SDK repos

Rationale:

- these look like the closest public reference ecosystem around ERC-4527

### If the goal is "integrate into MetaMask rather than wagmi"

Primary starting point:

- MetaMask keyring architecture
- `@metamask/eth-qr-keyring`

Rationale:

- that is wallet-side integration, not dApp-side integration

## Recommendation

For Shell, the direct path is:

1. keep building a protocol-first core SDK
2. add a React modal/scanner layer
3. build a small custom wagmi connector on top
4. validate payload compatibility against ERC-4527 and Keystone reference material

For a generic dApp integration story, wagmi + custom connector is the more direct and reusable path.

## Conclusion

ERC-4527 support in wagmi is possible today through a custom connector architecture.

This conclusion applies directly to QR-based browser flows such as Shell. Hardware wallets that rely on NFC, USB, or other direct transports require a separate transport analysis, because browser support for those interfaces is limited and platform-dependent.

What seems to be missing is not protocol feasibility, but a polished reusable package.

This leaves a clear opportunity:

- there is room for a `@shell-wallet/wagmi` package
- the surrounding building blocks already exist
- the main public references are Keystone's protocol/tooling ecosystem and existing third-party wagmi connector packages

## Sources

These links support the main findings above, especially the claims around ERC-4527 payloads, custom wagmi connectors, QR-based wallet precedents, and expansion paths for Shell and related integrations.

- ERC-4527 spec: https://eips.ethereum.org/EIPS/eip-4527
- EIPs mirror/status page for ERC-4527: https://eips-wg.github.io/EIPs/4527/
- wagmi homepage: https://wagmi.sh/
- wagmi WalletConnect connector source/repo listing: https://github.com/wevm/wagmi/blob/main/packages/connectors/src/walletConnect.ts
- wagmi discussion about custom connectors: https://github.com/wevm/wagmi/discussions/3535
- wagmi discussion about mocking connectors with `@wagmi/core` v2: https://github.com/wevm/wagmi/discussions/3420
- wagmi discussion about React Native custom connectors: https://github.com/wevm/wagmi/discussions/3099
- Web3Auth wagmi connector package: https://www.npmjs.com/package/@web3auth/web3auth-wagmi-connector
- Keystone developer hub: https://github.com/KeystoneHQ/Keystone-developer-hub
- Keystone Ethereum QR protocol write-up: https://github.com/KeystoneHQ/Keystone-developer-hub/blob/main/research/ethereum-qr-data-protocol.md
- Keystone UR registry: https://github.com/KeystoneHQ/ur-registry
- MDN WebUSB API: https://developer.mozilla.org/en-US/docs/Web/API/WebUSB_API
- MDN Web Serial API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API
- MDN Web NFC API: https://developer.mozilla.org/en-US/docs/Web/API/Web_NFC_API
