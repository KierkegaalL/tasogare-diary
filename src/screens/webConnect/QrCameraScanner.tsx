import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import jsQR from 'jsqr';

import { colors, fonts, radius, spacing } from '../../theme';

interface QrCameraScannerProps {
  onDecode: (text: string) => void;
  onClose: () => void;
}

// カメラで QR をライブ読取する（Web版連携画面専用。Platform.OS === 'web' でのみ描画される想定）。
// web/src/components/QrScanner.tsx と同じ方式（getUserMedia → 非表示 canvas に描画 → jsQR で
// デコード、rAF ループ）だが、React Native には <video>/<canvas> が無いため、View の ref から
// 実体の DOM ノードを取得し、video/canvas 要素を直接生成・追加する（RN Web の View は実 DOM 要素へ
// forwardRef するため可能）。
export function QrCameraScanner({ onDecode, onClose }: QrCameraScannerProps) {
  const mountRef = useRef<View>(null);
  const [error, setError] = useState('');
  // onDecode は親（WebConnectGate）の再レンダーの度に新しい関数参照になりうる。ref 経由で
  // 最新の実装を読むことで、カメラの起動 effect を初回マウント時のみに保ち、入力欄の編集等
  // 無関係な state 変化でカメラが再起動（許可プロンプト再表示・映像の瞬断）しないようにする
  // （reviewer指摘）。
  const onDecodeRef = useRef(onDecode);
  useEffect(() => {
    onDecodeRef.current = onDecode;
  }, [onDecode]);

  useEffect(() => {
    const container = mountRef.current as unknown as HTMLElement | null;
    if (!container) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let frameHandle: number | null = null;
    let decoded = false;

    const video = document.createElement('video');
    video.muted = true;
    video.setAttribute('playsinline', 'true');
    Object.assign(video.style, {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      borderRadius: `${radius.card}px`,
    });
    const canvas = document.createElement('canvas');
    canvas.style.display = 'none';
    container.appendChild(video);
    container.appendChild(canvas);

    function scanFrame() {
      if (decoded) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(frame.data, frame.width, frame.height);
          if (result?.data) {
            decoded = true;
            onDecodeRef.current(result.data);
            return;
          }
        }
      }
      frameHandle = requestAnimationFrame(scanFrame);
    }

    async function start() {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setError('このブラウザはカメラ読取に対応していません。コードを貼り付けてください。');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        if (cancelled) return;
        frameHandle = requestAnimationFrame(scanFrame);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'カメラへのアクセスが許可されませんでした。コードを貼り付けてください。'
            : 'カメラを起動できませんでした。コードを貼り付けてください。',
        );
      }
    }

    void start();

    return () => {
      cancelled = true;
      if (frameHandle !== null) cancelAnimationFrame(frameHandle);
      stream?.getTracks().forEach((t) => t.stop());
      container.removeChild(video);
      container.removeChild(canvas);
    };
    // onDecode は onDecodeRef 経由で読むため依存に含めない（意図的。上記コメント参照）。
  }, []);

  return (
    <View style={styles.wrap}>
      <View ref={mountRef} style={styles.frame} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={onClose} style={styles.closeBtn}>
        <Text style={styles.closeLabel}>カメラを閉じる</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', marginBottom: spacing.md },
  frame: {
    width: 220,
    height: 220,
    borderRadius: radius.card,
    backgroundColor: colors.duskSoft,
    overflow: 'hidden',
  },
  error: { fontFamily: fonts.uiRegular, fontSize: 12, color: colors.heavy, marginTop: spacing.sm, textAlign: 'center' },
  closeBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.paperSoft,
    borderWidth: 1,
    borderColor: colors.line,
  },
  closeLabel: { fontFamily: fonts.uiRegular, fontSize: 12, color: colors.inkSoft },
});
