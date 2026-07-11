import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import QRCode from 'react-native-qrcode-svg';

import { useRootNavigation } from '../../app/navigation/hooks';
import { ScreenShell } from '../../components/ScreenShell';
import { PrimaryButton } from '../../components/PrimaryButton';
import { createPairingToken, isPairingAvailable, pairingQrPayload } from '../../services/pairing';
import { AuthLinkError, linkKindLabel } from '../../services/auth';
import type { AccountLinkKind } from '../../services/auth';
import { useAuthStore } from '../../stores/authStore';
import { useLinkableAccountKinds } from '../../hooks/useAccountLink';
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
      <AccountLinkSection />
      <Text style={styles.footNote}>スマホの日記データはそのまま、安全に保たれます</Text>
    </ScreenShell>
  );
}

// 匿名アカウントを Apple/Google の恒久アカウントへ昇格する導線（environments.md）。
// ネイティブ資格情報ソースが提供されている環境（対応した開発ビルド）でのみ表示する。
// 既定（Expo Go）は canLinkAccount が false のため何も描画しない（未対応の空UIを出さない）。
function AccountLinkSection() {
  const linkAccount = useAuthStore((s) => s.linkAccount);
  const [busy, setBusy] = useState<AccountLinkKind | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 恒久化はまだ匿名のときだけ。既に Apple/Google 昇格済み、または導線が使えない環境では出さない。
  const kinds = useLinkableAccountKinds();
  if (kinds.length === 0) return null;

  const onLink = async (kind: AccountLinkKind) => {
    setBusy(kind);
    setError(null);
    setMessage(null);
    try {
      await linkAccount(kind);
      setMessage(`${linkKindLabel(kind)} と連携しました。次からこのアカウントでサインインできます。`);
    } catch (err) {
      // キャンセルはエラー表示しない。
      if (err instanceof AuthLinkError && err.code === 'cancelled') return;
      setError(err instanceof Error ? err.message : '連携に失敗しました。');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.linkSection}>
      <Text style={styles.linkTitle}>このデータを恒久アカウントに紐づける</Text>
      <Text style={styles.linkSub}>
        Apple／Google と連携すると、機種変更や再インストール後も同じ日記を引き継げます。
      </Text>
      {kinds.map((kind) => (
        <PrimaryButton
          key={kind}
          label={busy === kind ? '連携しています…' : `${linkKindLabel(kind)} と連携`}
          variant="ghost"
          disabled={busy !== null}
          onPress={() => void onLink(kind)}
        />
      ))}
      {message && <Text style={styles.linkOk}>{message}</Text>}
      {error && <Text style={styles.linkError}>{error}</Text>}
    </View>
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
  linkSection: {
    marginTop: spacing.xxl,
    paddingTop: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: spacing.sm,
  },
  linkTitle: { fontFamily: fonts.display, fontSize: 14, color: colors.ink, textAlign: 'center' },
  linkSub: {
    fontFamily: fonts.uiRegular,
    fontSize: 11,
    color: colors.inkFaint,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  linkOk: { fontFamily: fonts.uiRegular, fontSize: 11, color: colors.inkSoft, textAlign: 'center' },
  linkError: { fontFamily: fonts.uiRegular, fontSize: 11, color: colors.dusk, textAlign: 'center' },
  footNote: {
    fontFamily: fonts.uiRegular,
    fontSize: 10.5,
    color: colors.inkFaint,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});
