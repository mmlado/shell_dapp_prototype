import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import type { BtcKeyType, DerivedKeys, ScannedUR } from "../lib";
import {
  buildBtcSignRequestUR,
  buildEthSignRequestUR,
  parseBtcSignature,
  parseEthSignature,
} from "../lib";
import { QRScanner } from "../lib/react";

type SelectedKey = "evm" | BtcKeyType;

interface KeyRow {
  id: SelectedKey;
  label: string;
  bip: string;
  value: string | null;
}

interface AddressBookProps {
  keys: DerivedKeys;
  onBack: () => void;
}

export function AddressBook({ keys, onBack }: AddressBookProps) {
  const [message, setMessage] = useState("");
  const [selectedKey, setSelectedKey] = useState<SelectedKey | null>(null);
  const [signQR, setSignQR] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [signLabel, setSignLabel] = useState<string>("");
  const [signError, setSignError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const rows: KeyRow[] = useMemo(
    () => [
      {
        id: "evm",
        label: "EVM / Ethereum",
        bip: "BIP-44  m/44'/60'/0'/0/0",
        value: keys.evm,
      },
      {
        id: "btcLegacy",
        label: "Bitcoin Legacy",
        bip: "BIP-44  m/44'/0'/0'/0/0",
        value: keys.btcLegacy,
      },
      {
        id: "btcNestedSegwit",
        label: "Bitcoin Nested SegWit",
        bip: "BIP-49  m/49'/0'/0'/0/0",
        value: keys.btcNestedSegwit,
      },
      {
        id: "btcNativeSegwit",
        label: "Bitcoin Native SegWit",
        bip: "BIP-84  m/84'/0'/0'/0/0",
        value: keys.btcNativeSegwit,
      },
    ],
    [keys],
  );

  // Auto-select first available key
  useEffect(() => {
    if (selectedKey) return;
    const first = rows.find((r) => r.value !== null);
    if (first) setSelectedKey(first.id);
  }, [keys, rows, selectedKey]);

  const handleSign = useCallback(() => {
    if (!selectedKey || !message.trim()) return;
    const row = rows.find((r) => r.id === selectedKey);
    if (!row?.value) return;

    try {
      let urString: string;
      if (selectedKey === "evm") {
        urString = buildEthSignRequestUR(
          message.trim(),
          row.value,
          keys.sourceFingerprint,
        );
        setSignLabel("EIP-191 personal_sign");
      } else {
        urString = buildBtcSignRequestUR(
          message.trim(),
          row.value,
          selectedKey,
          keys.sourceFingerprint,
        );
        setSignLabel(`Bitcoin message — ${row.label}`);
      }
      setSignQR(urString);
      setSignature(null);
      setSignError(null);
      setScanning(false);
    } catch (e) {
      setSignError(`Failed to build sign request: ${(e as Error).message}`);
    }
  }, [selectedKey, message, keys, rows]);

  useEffect(() => {
    if (!signQR || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, signQR, {
      width: 380,
      margin: 3,
      color: { dark: "#000000", light: "#ffffff" },
    });
  }, [signQR]);

  const handleSignatureScan = useCallback(
    (result: ScannedUR | string): boolean | void => {
      try {
        if (typeof result === "string")
          throw new Error("Expected a UR QR code from Shell");
        if (result.type === "eth-signature") {
          const sig = parseEthSignature(result);
          setSignature(sig);
        } else if (result.type === "btc-signature") {
          const { signature: sig } = parseBtcSignature(result);
          setSignature(sig);
        } else {
          throw new Error(`Unexpected UR type: ${result.type}`);
        }
        setSignError(null);
        setScanning(false);
      } catch (e) {
        setSignError(`Failed to parse signature: ${(e as Error).message}`);
        return false; // keep scanning
      }
    },
    [],
  );

  const activeSelected = selectedKey
    ? (rows.find((r) => r.id === selectedKey)?.value ?? null)
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
          onChange={(e) => setMessage(e.target.value)}
        />
        <button className="sign-btn" onClick={handleSign} disabled={!canSign}>
          {selectedKey
            ? `Sign with ${rows.find((r) => r.id === selectedKey)?.label ?? "selected key"}`
            : "Sign"}
        </button>
      </div>

      {signQR && !signature && (
        <div className="sign-qr-section">
          {!scanning ? (
            <>
              <p className="sign-qr-label">Scan this QR code with Shell</p>
              <canvas ref={canvasRef} className="sign-qr-canvas" />
              <button
                className="scan-sig-btn"
                onClick={() => setScanning(true)}
              >
                Scan Shell's signature
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

          {signError && <p className="sign-error">{signError}</p>}
        </div>
      )}

      {signature && (
        <div className="signature-result">
          <p className="signature-label">{signLabel}</p>
          <code className="signature-value">{signature}</code>
        </div>
      )}
    </div>
  );
}
