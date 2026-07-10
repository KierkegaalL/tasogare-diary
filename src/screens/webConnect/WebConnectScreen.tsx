import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import QRCode from 'react-native-qrcode-svg';

import { useRootNavigation } from '../../app/navigation/hooks';
import { ScreenShell } from '../../components/ScreenShell';
import { PrimaryButton } from '../../components/PrimaryButton';
import { createPairingToken, isPairingAvailable, pairingQrPayload } from '../../services/pairing';
import { colors, fonts, radius, spacing } from '../../theme';

// ⑨ Webで見る（QR表示 / screen.md 3.10）。
// createPairingToken で短命トークン（60秒）を発行し QR 表示。失効に合わせて自動再発行する。
// verifyPairingToken（照合）は Web ダッシュボード側の処理。
export function WebConnectScreen() {
  const navigation = useRootNavigation();
  const netInfo = useNetInfo();
  const isOffline = netInfo.isConnected === false;

  const [token, setToken] = useState<string | null>(null);
  const [ttl, setTtl] = useState(60);
  const [remaining, setRemaining] = useState(60);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await createPairingToken();
      setToken(res.token);
      setTtl(res.ttlSeconds);
      setRemaining(res.ttlSeconds);
    } catch {
      setError(true);
      setToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // 初回発行。オフライン/未設定時は発行しない。
  // refresh は同期的に setState するため、effect 内で直接呼ばず macrotask に逃がす
  // （react-hooks/set-state-in-effect: effect 本体での同期 setState を避ける）。
  useEffect(() => {
    if (!isPairingAvailable || isOffline) return;
    const id = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(id);
  }, [refresh, isOffline]);

  // 残り時間カウントダウン。0 になったら自動で再発行する。
  useEffect(() => {
    if (!token) return;
    const id = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          void refresh();
          return ttl;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [token, ttl, refresh]);

  const body = () => {
    if (!isPairingAvailable) {
      return <Text style={styles.note}>この機能は現在利用できません（サーバ未設定）。</Text>;
    }
    if (isOffline) {
      return <Text style={styles.note}>オフラインのためコードを発行できません。オンラインでお試しください。</Text>;
    }
    if (loading && !token) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={colors.dusk} />
          <Text style={styles.note}>コードを準備しています…</Text>
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.center}>
          <Text style={styles.note}>コードの発行に失敗しました。</Text>
          <PrimaryButton label="もう一度" variant="ghost" onPress={() => void refresh()} />
        </View>
      );
    }
    if (token) {
      const ratio = Math.max(0, Math.min(1, remaining / ttl));
      return (
        <View style={styles.center}>
          <View style={styles.qrCard} accessibilityLabel="ペアリング用QRコード">
            <QRCode value={pairingQrPayload(token)} size={196} backgroundColor="transparent" color={colors.ink} />
          </View>
          <View style={styles.timerTrack}>
            <View style={[styles.timerFill, { width: `${ratio * 100}%` }]} />
          </View>
          <Text style={styles.timerLabel}>60秒ごとに更新（残り{remaining}秒）</Text>
        </View>
      );
    }
    return null;
  };

  return (
    <ScreenShell title="Webで見る" onBack={() => navigation.goBack()}>
      <Text style={styles.prompt}>パソコンでも、書いた日記をそのまま見られます</Text>
      <Text style={styles.promptSub}>下のコードを、パソコンのブラウザで読み取ってください</Text>
      {body()}
      <Text style={styles.footNote}>スマホの日記データはそのまま、安全に保たれます</Text>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  prompt: { fontFamily: fonts.display, fontSize: 15, color: colors.ink, textAlign: 'center' },
  promptSub: {
    fontFamily: fonts.uiRegular,
    fontSize: 12,
    color: colors.inkFaint,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  center: { alignItems: 'center', gap: spacing.md },
  qrCard: {
    backgroundColor: colors.paperSoft,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.xl,
  },
  timerTrack: {
    width: 196,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  timerFill: { height: 4, borderRadius: 2, backgroundColor: colors.dusk },
  timerLabel: { fontFamily: fonts.uiRegular, fontSize: 11, color: colors.inkFaint },
  note: { fontFamily: fonts.uiRegular, fontSize: 12, color: colors.inkFaint, textAlign: 'center' },
  footNote: {
    fontFamily: fonts.uiRegular,
    fontSize: 10.5,
    color: colors.inkFaint,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});
