import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, ScanLine, X } from 'lucide-react';
import { Button } from '@estene/ui/button';
import { Dialog, DialogContent } from '@estene/ui/dialog';

type BarcodeDetectorLike = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };
declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike;
  }
}

/**
 * The counter's single input. Hand-held scanners type the code and press
 * Enter, so the field stays focused; the camera button reads QR tags on
 * devices with the BarcodeDetector API (Chrome, Android). Typing a tag code
 * or tracking number works everywhere.
 */
export function ScanBar({
  onScan,
  busy,
  placeholder = 'Scan a QR tag or type a tracking number',
}: {
  onScan: (code: string) => void;
  busy?: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState('');
  const [camera, setCamera] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const canUseCamera =
    typeof window !== 'undefined' &&
    !!window.BarcodeDetector &&
    !!navigator.mediaDevices?.getUserMedia;

  const submit = (code: string) => {
    const c = code.trim().toUpperCase();
    if (c.length < 6) return;
    onScan(c);
    setValue('');
    inputRef.current?.focus();
  };

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
        className="border-primary/30 bg-card focus-within:border-primary flex items-center gap-2 rounded-xl border-2 p-2"
      >
        <ScanLine className="text-primary ml-2 size-5 shrink-0" aria-hidden />
        <input
          ref={inputRef}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          aria-label="Scan or enter a code"
          autoComplete="off"
          spellCheck={false}
          className="placeholder:text-muted-foreground h-11 min-w-0 flex-1 bg-transparent font-mono text-base uppercase placeholder:font-sans placeholder:normal-case focus:outline-none"
        />
        {busy && <Loader2 className="text-muted-foreground size-5 animate-spin" />}
        {canUseCamera && (
          <Button type="button" variant="outline" onClick={() => setCamera(true)}>
            <Camera />
            Camera
          </Button>
        )}
        <Button type="submit" disabled={value.trim().length < 6}>
          Find
        </Button>
      </form>
      {camera && (
        <CameraScanner
          onClose={() => setCamera(false)}
          onCode={(c) => {
            setCamera(false);
            submit(c);
          }}
        />
      )}
    </>
  );
}

function CameraScanner({
  onCode,
  onClose,
}: {
  onCode: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const detector = new window.BarcodeDetector!({ formats: ['qr_code', 'code_128'] });

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (s) => {
        stream = s;
        if (!videoRef.current) return;
        videoRef.current.srcObject = s;
        await videoRef.current.play();
        const tick = async () => {
          if (stopped || !videoRef.current) return;
          const [hit] = await detector.detect(videoRef.current).catch(() => []);
          if (hit?.rawValue) return onCode(hit.rawValue);
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      })
      .catch(() => setError('Camera unavailable — allow camera access or use a hand scanner.'));

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Scan a QR tag" description="Hold the parcel’s tag inside the frame.">
        {error ? (
          <p className="text-destructive text-sm">{error}</p>
        ) : (
          <div className="relative overflow-hidden rounded-lg bg-black">
            <video ref={videoRef} className="aspect-video w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-amber-400/80" />
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button variant="outline" onClick={onClose}>
            <X />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
