import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import type { BtcKeyType, DerivedKeys, ScannedUR } from "../lib";
import {
  buildBtcSignRequestURParts,
  buildEthSignRequestURParts,
  parseBtcSignature,
  parseEthSignature,
  verifyBtcSignatureResponse,
} from "../lib";
import { QRScanner } from "../lib/react";

type SelectedKey = "evm" | BtcKeyType;

interface KeyRow {
  id: SelectedKey;
  label: string;
  bip: string;
  value: string | null;
  publicKey: string | null;
}

interface AddressBookProps {
  keys: DerivedKeys;
  onBack: () => void;
}

interface SignRequestState {
  address: string;
  message: string;
  protocolLabel: string;
  qrParts: string[];
}

export function AddressBook({ keys, onBack }: AddressBookProps) {
  const [message, setMessage] = useState("");
  const [selectedKey, setSelectedKey] = useState<SelectedKey | null>(null);
  const [activeRequest, setActiveRequest] = useState<SignRequestState | null>(
    null,
  );
  const [scanning, setScanning] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [signLabel, setSignLabel] = useState<string>("");
  const [signError, setSignError] = useState<string | null>(null);
  const [verificationStatus, setVerificationStatus] = useState<
    "verified" | "failed" | null
  >(null);
  const [qrFrameIndex, setQrFrameIndex] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const rows: KeyRow[] = useMemo(
    () => [
      {
        id: "evm",
        label: "EVM / Ethereum",
        bip: "BIP-44  m/44'/60'/0'/0/0",
        value: keys.evm,
        publicKey: keys.evmPublicKey,
      },
      {
        id: "btcLegacy",
        label: "Bitcoin Legacy",
        bip: "BIP-44  m/44'/0'/0'/0/0",
        value: keys.btcLegacy,
        publicKey: keys.btcLegacyPublicKey,
      },
      {
        id: "btcNestedSegwit",
        label: "Bitcoin Nested SegWit",
        bip: "BIP-49  m/49'/0'/0'/0/0",
        value: keys.btcNestedSegwit,
        publicKey: keys.btcNestedSegwitPublicKey,
      },
      {
        id: "btcNativeSegwit",
        label: "Bitcoin Native SegWit",
        bip: "BIP-84  m/84'/0'/0'/0/0",
        value: keys.btcNativeSegwit,
        publicKey: keys.btcNativeSegwitPublicKey,
      },
    ],
    [keys],
  );

  useEffect(() => {
    if (selectedKey) return;
    const first = rows.find((row) => row.value !== null);
    if (first) setSelectedKey(first.id);
  }, [rows, selectedKey]);

  const handleSign = useCallback(() => {
    if (!selectedKey || !message.trim()) return;
    const row = rows.find((item) => item.id === selectedKey);
    if (!row?.value) return;

    try {
      const trimmedMessage = message.trim();
      let qrParts: string[];
      let protocolLabel: string;

      if (selectedKey === "evm") {
        qrParts = buildEthSignRequestURParts(
          trimmedMessage,
          row.value,
          keys.sourceFingerprint,
        );
        protocolLabel = "EIP-191 personal_sign";
      } else {
        qrParts = buildBtcSignRequestURParts(
          trimmedMessage,
          row.value,
          selectedKey,
          keys.sourceFingerprint,
        );
        protocolLabel = `Bitcoin message — ${row.label}`;
      }

      setActiveRequest({
        address: row.value,
        message: trimmedMessage,
        protocolLabel,
        qrParts,
      });
      setSignature(null);
      setSignLabel("");
      setSignError(null);
      setVerificationStatus(null);
      setScanning(false);
      setQrFrameIndex(0);
    } catch (error) {
      setSignError(`Failed to build sign request: ${(error as Error).message}`);
    }
  }, [keys.sourceFingerprint, message, rows, selectedKey]);

  useEffect(() => {
    if (!activeRequest || !canvasRef.current || scanning || signature) return;
    const currentQR =
      activeRequest.qrParts[qrFrameIndex] ?? activeRequest.qrParts[0];
    if (!currentQR) return;

    QRCode.toCanvas(canvasRef.current, currentQR, {
      width: 380,
      margin: 3,
      color: { dark: "#000000", light: "#ffffff" },
    });
  }, [activeRequest, qrFrameIndex, scanning, signature]);

  useEffect(() => {
    if (
      !activeRequest ||
      scanning ||
      signature ||
      activeRequest.qrParts.length <= 1
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      setQrFrameIndex((index) => (index + 1) % activeRequest.qrParts.length);
    }, 180);

    return () => window.clearInterval(timer);
  }, [activeRequest, scanning, signature]);

  const handleSignatureScan = useCallback(
    (result: ScannedUR | string): boolean | void => {
      try {
        if (!activeRequest) {
          throw new Error("No active signing request");
        }
        if (typeof result === "string") {
          throw new Error("Expected a UR QR code from Shell");
        }

        if (result.type === "eth-signature") {
          const parsedSignature = parseEthSignature(result);
          setSignature(parsedSignature);
          setSignLabel(activeRequest.protocolLabel);
          setVerificationStatus("verified");
        } else if (result.type === "btc-signature") {
          const { signature: parsedSignature, publicKey } =
            parseBtcSignature(result);
          const verified = verifyBtcSignatureResponse(
            activeRequest.address,
            activeRequest.message,
            parsedSignature,
            publicKey,
          );

          if (!verified) {
            throw new Error(
              "Bitcoin signature did not verify against the requested message and address",
            );
          }

          setSignature(parsedSignature);
          setSignLabel(activeRequest.protocolLabel);
          setVerificationStatus("verified");
        } else {
          throw new Error(`Unexpected UR type: ${result.type}`);
        }

        setSignError(null);
        setScanning(false);
      } catch (error) {
        setVerificationStatus("failed");
        setSignError(`Failed to parse signature: ${(error as Error).message}`);
        return false;
      }
    },
    [activeRequest],
  );

  const activeSelected = selectedKey
    ? (rows.find((row) => row.id === selectedKey)?.value ?? null)
    : null;
  const canSign = !!activeSelected && !!message.trim();

  return (
    <div className="address-book">
      <div className="address-book-header">
        <button className="back-btn" onClick={onBack}>
          ← Back
        </button>
        <h2>Derived Keys</h2>
      </div>

      <ul className="key-list">
        {rows.map((row) => (
          <li
            key={row.id}
            className={[
              "key-row",
              row.value ? "active" : "inactive",
              selectedKey === row.id && row.value ? "selected" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => row.value && setSelectedKey(row.id)}
          >
            <div className="key-meta">
              <span className="key-label">{row.label}</span>
              <span className="key-bip">{row.bip}</span>
            </div>
            <div className="key-address">
              {row.value ?? (
                <span className="not-available">
                  Not available for this key type
                </span>
              )}
            </div>
            {row.publicKey && <div className="key-pubkey">{row.publicKey}</div>}
          </li>
        ))}
      </ul>

      <div className="message-section">
        <label htmlFor="message" className="message-label">
          Message to sign
        </label>
        <textarea
          id="message"
          className="message-textarea"
          placeholder="Enter a message…"
          rows={4}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
        <button className="sign-btn" onClick={handleSign} disabled={!canSign}>
          {selectedKey
            ? `Sign with ${rows.find((row) => row.id === selectedKey)?.label ?? "selected key"}`
            : "Sign"}
        </button>
      </div>

      {activeRequest && !signature && (
        <div className="sign-qr-section">
          {!scanning ? (
            <>
              <p className="sign-qr-label">Scan this QR code with Shell</p>
              {activeRequest.qrParts.length > 1 && (
                <p className="sign-qr-label">
                  Animated QR {qrFrameIndex + 1}/{activeRequest.qrParts.length}
                </p>
              )}
              <canvas ref={canvasRef} className="sign-qr-canvas" />
              <button
                className="scan-sig-btn"
                onClick={() => setScanning(true)}
              >
                Scan Shell&apos;s signature
              </button>
            </>
          ) : (
            <div className="sig-scanner-wrap">
              <QRScanner
                onScan={handleSignatureScan}
                hint="Scan Shell's signature QR"
              />
            </div>
          )}

          {signError && (
            <div className="verification-feedback failed">
              <span className="verification-icon" aria-hidden="true">
                ✕
              </span>
              <p className="sign-error">{signError}</p>
            </div>
          )}
        </div>
      )}

      {signature && (
        <div className="signature-result">
          <div className="signature-header">
            <p className="signature-label">{signLabel}</p>
            {verificationStatus && (
              <span
                className={`verification-badge ${verificationStatus}`}
                aria-live="polite"
              >
                {verificationStatus === "verified"
                  ? "✓ Verified"
                  : "✕ Verification failed"}
              </span>
            )}
          </div>
          <code className="signature-value">{signature}</code>
        </div>
      )}
    </div>
  );
}
