'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { runQrVideoScan } from '@shared/qrScan';

interface QrScannerProps {
  onDecode: (text: string) => void;
  onClose: () => void;
}

// カメラで QR をライブ読取する（screen.md 4.2 の後続対応）。
// getUserMedia → video フレームを非表示 canvas に描画 → jsQR でデコード、というループ本体は
// モバイル（Expo Web限定・src/screens/webConnect/QrCameraScanner.tsx）と共通のため
// shared/qrScan.ts に集約している（architecture.md 第6章）。ここでは JSX で用意した
// video/canvas 要素を渡すだけでよい。
export function QrScanner({ onDecode, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    return runQrVideoScan(video, canvas, onDecode, setError);
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
