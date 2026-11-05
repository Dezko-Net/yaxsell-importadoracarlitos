'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, X, RotateCcw, Zap, Check } from 'lucide-react';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
  /** Tras confirmar, prepara otro escaneo sin cerrar la cámara. */
  continuous?: boolean;
}

export default function BarcodeScanner({ onScan, onClose, continuous }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [detected, setDetected] = useState(false);
  const [lastCode, setLastCode] = useState('');
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch {
        if (!cancelled) setError('No se pudo acceder a la cámara. Verifica los permisos.');
      }
    })();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const captureAndScan = async () => {
    const video = videoRef.current;
    if (!video) return;
    setScanning(true);
    setError('');

    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas failed');
      ctx.drawImage(video, 0, 0);

      let decodedText = '';

      if ('BarcodeDetector' in window) {
        try {
          const detector = new (window as unknown as { BarcodeDetector: new (o: object) => { detect: (c: HTMLCanvasElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e']
          });
          const results = await detector.detect(canvas);
          if (results.length > 0) decodedText = results[0].rawValue;
        } catch { /* fallback */ }
      }

      if (!decodedText) {
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
        });
        const file = new File([blob], 'capture.png', { type: 'image/png' });

        const helperId = 'bch-' + Date.now();
        const helperDiv = document.createElement('div');
        helperDiv.id = helperId;
        helperDiv.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;overflow:hidden;';
        document.body.appendChild(helperDiv);

        try {
          const { Html5Qrcode } = await import('html5-qrcode');
          const scanner = new Html5Qrcode(helperId);
          const result = await scanner.scanFileV2(file, false);
          decodedText = result.decodedText;
          scanner.clear();
        } finally {
          if (document.body.contains(helperDiv)) document.body.removeChild(helperDiv);
        }
      }

      if (decodedText) {
        setDetected(true);
        setLastCode(decodedText);
      } else {
        setError('No se detectó código. Apunta mejor e intenta de nuevo.');
        setTimeout(() => setError(''), 3000);
      }
    } catch {
      setError('No se detectó código. Apunta mejor e intenta de nuevo.');
      setTimeout(() => setError(''), 3000);
    } finally {
      setScanning(false);
    }
  };

  const confirmScan = () => {
    const code = String(lastCode ?? '').trim();
    if (!code) return;
    try {
      onScanRef.current(code);
      if (continuous) rescan();
    } catch (err) {
      console.error('[BarcodeScanner] onScan error:', err);
    }
  };

  const rescan = () => {
    setDetected(false);
    setLastCode('');
    setError('');
  };

  return (
    <div
      className="fixed inset-0 z-[200] bg-black flex flex-col"
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Lector de código de barras"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute z-30 flex items-center justify-center w-12 h-12 rounded-full bg-black/70 border-2 border-white/30 text-white shadow-lg active:scale-95 transition-transform"
        style={{
          top: 'max(0.75rem, env(safe-area-inset-top, 0.75rem))',
          right: 'max(0.75rem, env(safe-area-inset-right, 0.75rem))',
        }}
        aria-label="Cerrar lector"
      >
        <X className="w-7 h-7" strokeWidth={2.5} />
      </button>

      <div className="flex-1 flex flex-col items-center justify-center px-4 pt-14 pb-4 min-h-0 w-full max-w-md mx-auto">
        <div className="flex items-center gap-2 text-white mb-3 w-full shrink-0">
          <Camera className="w-5 h-5 shrink-0" />
          <span className="text-sm font-semibold">Escanear código de barras</span>
          {continuous && (
            <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-full">
              Modo ráfaga
            </span>
          )}
        </div>

        <div className="relative w-full flex-1 min-h-[200px] max-h-[50vh] rounded-xl overflow-hidden bg-gray-900 border-2 border-white/25">
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
          {ready && !detected && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-[min(280px,85%)] h-[120px] border-2 border-emerald-400/70 rounded-lg" />
            </div>
          )}
          {scanning && (
            <div className="absolute inset-0 bg-white/20 flex items-center justify-center">
              <div className="w-10 h-10 border-[3px] border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>

        {!ready && !error && (
          <div className="flex items-center justify-center py-4 text-white/60 text-sm shrink-0">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
            Iniciando cámara...
          </div>
        )}

        <div className="w-full shrink-0 mt-4 space-y-2">
          {ready && !detected && (
            <>
              <button
                type="button"
                onClick={captureAndScan}
                disabled={scanning}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-900/80 text-white font-bold rounded-2xl flex items-center justify-center gap-2 text-lg shadow-lg active:scale-[0.98] transition"
              >
                {scanning ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Escaneando...
                  </>
                ) : (
                  <>
                    <Zap className="w-6 h-6" />
                    Tomar foto y escanear
                  </>
                )}
              </button>
              <p className="text-white/50 text-xs text-center">Apunta al código y pulsa el botón</p>
            </>
          )}

          {error && (
            <div className="text-amber-300 text-sm text-center py-3 bg-amber-500/15 rounded-xl border border-amber-500/40">
              {error}
            </div>
          )}

          {detected && (
            <>
              <div className="bg-emerald-500/20 border border-emerald-400 rounded-xl p-3 text-center">
                <div className="text-emerald-300 text-xs font-semibold mb-1">Código detectado</div>
                <div className="text-white font-mono text-lg font-bold break-all">{lastCode}</div>
              </div>
              <button
                type="button"
                onClick={confirmScan}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl flex items-center justify-center gap-2"
              >
                <Check className="w-5 h-5" />
                Confirmar y continuar
              </button>
              <button
                type="button"
                onClick={rescan}
                className="w-full py-2.5 bg-white/10 hover:bg-white/15 text-white text-sm font-medium rounded-xl flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Reescanear
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}