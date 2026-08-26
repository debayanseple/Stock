import { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CameraOff, RotateCw, ScanLine } from "lucide-react";

type ScannerState = "starting" | "active" | "denied" | "no-camera" | "error";

interface BarcodeScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called for each accepted decode (duplicates within 1s are ignored). */
  onDetected: (text: string) => void;
  /** Keep the viewfinder open after a successful decode (back-to-back scanning). */
  continuous?: boolean;
  /** Optional status text overlaid at the bottom (e.g. running cart total). */
  overlayLabel?: string;
}

// Retail 1D formats only — keeps decoding fast and avoids QR false-positives.
// (EAN-13, EAN-8, UPC-A, Code128 are set via ZXing hints in startScanner.)

export function BarcodeScanner({
  open,
  onOpenChange,
  onDetected,
  continuous = false,
  overlayLabel,
}: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const cancelledRef = useRef(false);
  const lastDecodeRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const [state, setState] = useState<ScannerState>("starting");
  const [errorMsg, setErrorMsg] = useState("");
  const [lastAccepted, setLastAccepted] = useState<string | null>(null);

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    const video = videoRef.current;
    if (video?.srcObject) {
      (video.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    }
  }, []);

  const startScanner = useCallback(async () => {
    setState("starting");
    setErrorMsg("");
    stopScanner();
    cancelledRef.current = false;

    try {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const { BarcodeFormat, DecodeHintType } = await import("@zxing/library");

      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13,
        BarcodeFormat.EAN_8,
        BarcodeFormat.UPC_A,
        BarcodeFormat.CODE_128,
      ]);
      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 150,
        delayBetweenScanSuccess: 800,
      });

      const video = videoRef.current;
      if (!video || cancelledRef.current) return;

      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: "environment" } },
        video,
        (result) => {
          if (!result) return;
          const text = result.getText().trim();
          if (!text) return;
          const now = Date.now();
          if (lastDecodeRef.current.text === text && now - lastDecodeRef.current.at < 1000) {
            return; // debounce duplicate decodes while aimed at the same label
          }
          lastDecodeRef.current = { text, at: now };
          setLastAccepted(text);
          onDetectedRef.current(text);
        },
      );

      if (cancelledRef.current) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
      setState("active");
    } catch (err) {
      if (cancelledRef.current) return;
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setState("denied");
      } else if (
        name === "NotFoundError" ||
        name === "OverconstrainedError" ||
        name === "NotReadableError"
      ) {
        setState("no-camera");
      } else {
        setState("error");
        setErrorMsg(err instanceof Error ? err.message : "Could not start the camera.");
      }
    }
  }, [stopScanner]);

  useEffect(() => {
    if (open) {
      void startScanner();
    } else {
      cancelledRef.current = true;
      stopScanner();
      setState("starting");
      setLastAccepted(null);
      lastDecodeRef.current = { text: "", at: 0 };
    }
    return () => {
      cancelledRef.current = true;
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const stateUi: Record<
    Exclude<ScannerState, "active">,
    { title: string; hint: string; retryable: boolean }
  > = {
    starting: {
      title: "Starting camera…",
      hint: "Allow camera access when prompted.",
      retryable: false,
    },
    denied: {
      title: "Camera permission blocked",
      hint: "Enable camera access for this site in your browser settings, then retry.",
      retryable: true,
    },
    "no-camera": {
      title: "No camera found",
      hint: "This device has no usable camera. Use the item ID box instead.",
      retryable: true,
    },
    error: { title: "Camera error", hint: errorMsg || "Something went wrong.", retryable: true },
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100%-2rem)] p-4 sm:max-w-md sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-4 w-4" /> Scan barcode
          </DialogTitle>
          <DialogDescription>
            Point the camera at the product's barcode.
            {continuous ? " Scanning continues after each add." : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
          {/* iOS Safari requires playsinline + muted, otherwise it goes fullscreen */}
          <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />

          {/* Viewfinder guide */}
          {state === "active" && (
            <>
              <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-primary/70" />
              <div className="pointer-events-none absolute inset-6 rounded-lg border-2 border-white/40" />
              {continuous && overlayLabel && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-background/90 px-3 py-1 text-xs font-medium shadow">
                  {overlayLabel}
                </div>
              )}
              {!continuous && lastAccepted && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 max-w-[90%] truncate rounded-full bg-background/90 px-3 py-1 font-mono text-xs shadow">
                  {lastAccepted}
                </div>
              )}
            </>
          )}

          {state !== "active" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
              {state === "starting" ? (
                <RotateCw className="h-8 w-8 animate-spin text-muted-foreground" />
              ) : (
                <CameraOff className="h-8 w-8 text-muted-foreground" />
              )}
              <div>
                <p className="text-sm font-medium">
                  {stateUi[state as Exclude<ScannerState, "active">].title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {stateUi[state as Exclude<ScannerState, "active">].hint}
                </p>
              </div>
              {stateUi[state as Exclude<ScannerState, "active">].retryable && (
                <Button size="sm" variant="outline" onClick={() => void startScanner()}>
                  <RotateCw className="h-4 w-4 mr-1" /> Retry
                </Button>
              )}
            </div>
          )}
        </div>

        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Done
        </Button>
      </DialogContent>
    </Dialog>
  );
}
