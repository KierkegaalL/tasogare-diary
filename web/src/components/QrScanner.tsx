'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import jsQR from 'jsqr';

interface QrScannerProps {
  onDecode: (text: string) => void;
  onClose: () => void;
}

// カメラで QR をライブ読取する（screen.md 4.2 の後続対応）。
// getUserMedia → video フレームを非表示 canvas に描画 → jsQR でデコード、を rAF ループで繰り返す。
export function QrScanner({ onDecode, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const decodedRef = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setError('このブラウザはカメラ読取に対応していません。コードを貼り付けてください。');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;
        frameRef.current = requestAnimationFrame(scanFrame);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'カメラへのアクセスが許可されませんでした。コードを貼り付けてください。'
            : 'カメラを起動できませんでした。コードを貼り付けてください。',
        );
      }
    }

    function scanFrame() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || decodedRef.current) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(frame.data, frame.width, frame.height);
          if (result?.data) {
            decodedRef.current = true;
            onDecode(result.data);
            return;
          }
        }
      }
      frameRef.current = requestAnimationFrame(scanFrame);
    }

    void start();

    return () => {
      cancelled = true;
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={styles.wrap}>
      <div style={styles.frame}>
        <video ref={videoRef} style={styles.video} muted playsInline aria-label="QRコードのカメラ映像" />
        <canvas ref={canvasRef} style={styles.hiddenCanvas} aria-hidden />
        <span style={styles.corner('tl')} />
        <span style={styles.corner('tr')} />
        <span style={styles.corner('bl')} />
        <span style={styles.corner('br')} />
      </div>
      {error && (
        <p style={styles.error} role="alert">
          {error}
        </p>
      )}
      <button onClick={onClose} style={styles.closeBtn}>
        カメラを閉じる
      </button>
    </div>
  );
}

const styles = {
  wrap: { marginBottom: 16, textAlign: 'center' } as CSSProperties,
  frame: {
    position: 'relative',
    width: '100%',
    maxWidth: 280,
    aspectRatio: '1 / 1',
    margin: '0 auto',
    borderRadius: 12,
    overflow: 'hidden',
    background: 'var(--dusk-soft)',
  } as CSSProperties,
  video: { width: '100%', height: '100%', objectFit: 'cover' } as CSSProperties,
  hiddenCanvas: { display: 'none' } as CSSProperties,
  corner: (pos: 'tl' | 'tr' | 'bl' | 'br'): CSSProperties => ({
    position: 'absolute',
    width: 22,
    height: 22,
    borderColor: 'var(--paper-soft)',
    borderStyle: 'solid',
    borderWidth: 0,
    ...(pos.includes('t') ? { top: 10, borderTopWidth: 3 } : { bottom: 10, borderBottomWidth: 3 }),
    ...(pos.includes('l') ? { left: 10, borderLeftWidth: 3 } : { right: 10, borderRightWidth: 3 }),
  }),
  error: { color: 'var(--heavy)', fontSize: 13, margin: '10px 0 0' } as CSSProperties,
  closeBtn: {
    marginTop: 10,
    padding: '8px 18px',
    fontSize: 13,
    color: 'var(--ink-soft)',
    background: 'var(--paper-soft)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--radius-pill)',
  } as CSSProperties,
};
