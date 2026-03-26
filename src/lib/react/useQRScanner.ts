import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { URDecoder } from "@ngraveio/bc-ur";
import type { ScannedUR } from "../types";

export interface UseQRScannerOptions {
  /**
   * Called when a QR code is successfully decoded.
   * Return false to keep scanning (e.g. on a parse error), or void/true to stop.
   */
  onScan: (result: ScannedUR | string) => boolean | void;
}

export interface UseQRScannerResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** 0–100 while scanning an animated UR, null otherwise */
  progress: number | null;
  /** Camera permission error, if any */
  error: string | null;
}

export function useQRScanner({
  onScan,
}: UseQRScannerOptions): UseQRScannerResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const decoderRef = useRef<URDecoder>(new URDecoder());
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() =>
        setError("Camera access denied. Please allow camera permissions."),
      );

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);

      if (code) {
        const part = code.data;
        if (part.toLowerCase().startsWith("ur:")) {
          decoderRef.current.receivePart(part.toLowerCase());
          const pct = decoderRef.current.estimatedPercentComplete();
          setProgress(Math.round(pct * 100));
          if (decoderRef.current.isComplete()) {
            const ur = decoderRef.current.resultUR();
            if (
              onScan({ type: ur.type, cbor: new Uint8Array(ur.cbor) }) !== false
            )
              return;
            decoderRef.current = new URDecoder();
            setProgress(null);
          }
        } else {
          if (onScan(part) !== false) return;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      active = false;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onScan]);

  return { videoRef, canvasRef, progress, error };
}
