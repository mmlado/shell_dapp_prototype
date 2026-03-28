import { useCallback, useState } from "react";
import { QRScanner } from "./lib/react";
import type { ScannedUR } from "./lib";
import { AddressBook } from "./components/AddressBook";
import { parseXpub, deriveKeys } from "./lib";
import type { DerivedKeys } from "./lib";
import "./App.css";

type Screen = "scan" | "addresses";

export default function App() {
  const [screen, setScreen] = useState<Screen>("scan");
  const [keys, setKeys] = useState<DerivedKeys | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const handleScan = useCallback((data: ScannedUR | string): boolean | void => {
    try {
      const parsed = parseXpub(data);
      const derived = deriveKeys(parsed);
      setKeys(derived);
      setScanError(null);
      setScreen("addresses");
      // return undefined → scanner stops (success)
    } catch (e) {
      setScanError(`Could not parse QR code: ${(e as Error).message}`);
      return false; // keep scanning
    }
  }, []);

  return (
    <div className="app">
      {screen === "scan" && (
        <>
          <div className="scan-screen">
            <div className="connect-instructions">
              <h2>Connect Shell</h2>
              <ol>
                <li>
                  On Shell, go to <strong>Connect software wallet</strong>
                </li>
                <li>Select a chain (Ethereum or Bitcoin)</li>
                <li>Point Shell's screen at this camera</li>
              </ol>
            </div>
            <QRScanner onScan={handleScan} />
            {scanError && <div className="scan-error">{scanError}</div>}
            <div className="connect-instructions">
              <p>
                Connect to the Shell hardware wallet via QR codes — no extension, no USB, no Bluetooth.{" "}
                <a
                  href="https://github.com/mmlado/shell_dapp_prototype"
                  target="_blank"
                  rel="noreferrer"
                >
                  Source on GitHub
                </a>{" "}
                &mdash;{" "}
                <a
                  href="https://github.com/logos-co/lambda-prize/pull/21"
                  target="_blank"
                  rel="noreferrer"
                >
                  Logos Lambda Prize winner
                </a>
              </p>
              <p>
                Don't have Shell yet?{" "}
                <a href="https://get.keycard.tech/mmlado" target="_blank" rel="noreferrer">
                  Get one here
                </a>{" "}
                — use code <strong>ShellSummer9746</strong> for 5% off orders over $25.
              </p>
            </div>
          </div>
        </>
      )}
      {screen === "addresses" && keys && (
        <AddressBook keys={keys} onBack={() => setScreen("scan")} />
      )}
    </div>
  );
}
