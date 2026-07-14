import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { runQrVideoScan } from '../../../shared/qrScan';
import { colors, fonts, radius, spacing } from '../../theme';

interface QrCameraScannerProps {
  onDecode: (text: string) => void;
  onClose: () => void;
}

// カメラで QR をライブ読取する（Web版連携画面専用。Platform.OS === 'web' でのみ描画される想定）。
// getUserMedia → 非表示 canvas に描画 → jsQR でデコード、という rAF ループ本体は
// web/src/components/QrScanner.tsx と共通のため shared/qrScan.ts に集約している
// （architecture.md 第6章）。React Native には <video>/<canvas> が無いため、View の ref から
// 実体の DOM ノードを取得し、video/canvas 要素を直接生成・追加する（RN Web の View は実 DOM 要素へ
// forwardRef するため可能）。それ以外のカメラ起動・デコードループはここでは持たない。
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

    const stop = runQrVideoScan(video, canvas, (text) => onDecodeRef.current(text), setError);

    return () => {
      stop();
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
