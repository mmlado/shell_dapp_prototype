import { useQRScanner } from "./useQRScanner";
import type { ScannedUR } from "../types";

interface QRScannerProps {
  /** Return false to keep scanning (e.g. on parse error), void/true to stop. */
  onScan: (result: ScannedUR | string) => boolean | void;
  hint?: string;
}

export function QRScanner({ onScan, hint }: QRScannerProps) {
  const { videoRef, canvasRef, progress, error } = useQRScanner({ onScan });

  if (error) return <div className="scanner-error">{error}</div>;

  return (
    <div className="scanner-container">
      <div className="scanner-frame">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="scanner-video"
        />
        <canvas ref={canvasRef} className="scanner-canvas" />
        <div className="scanner-overlay">
          <div className="scanner-corner tl" />
          <div className="scanner-corner tr" />
          <div className="scanner-corner bl" />
          <div className="scanner-corner br" />
        </div>
        {progress !== null && progress < 100 && (
          <div className="scanner-progress">{progress}%</div>
        )}
      </div>
      <p className="scanner-hint">
        {progress !== null && progress < 100
          ? "Keep scanning — animated QR in progress…"
          : (hint ?? "Point camera at the QR code")}
      </p>
    </div>
  );
}
