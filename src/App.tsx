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
          <QRScanner onScan={handleScan} />
          {scanError && <div className="scan-error">{scanError}</div>}
        </>
      )}
      {screen === "addresses" && keys && (
        <AddressBook keys={keys} onBack={() => setScreen("scan")} />
      )}
    </div>
  );
}
