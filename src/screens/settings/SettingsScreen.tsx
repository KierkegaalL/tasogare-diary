import React, { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import QRCode from 'react-native-qrcode-svg';

import { useRootNavigation } from '../../app/navigation/hooks';
import { ScreenShell } from '../../components/ScreenShell';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useLinkableAccountKinds } from '../../hooks/useAccountLink';
import { deleteAccount, isAccountDeletionAvailable } from '../../services/account';
import { isFirebaseConfigured } from '../../services/firebase/config';
import { createPairingToken, isPairingAvailable, pairingQrPayload } from '../../services/pairing';
import { AuthLinkError, linkKindLabel } from '../../services/auth';
import type { AccountLinkKind } from '../../services/auth';
import { useAuthStore } from '../../stores/authStore';
import { useEntriesStore } from '../../stores/entriesStore';
import { colors, fonts, radius, spacing } from '../../theme';

// ⑧ 設定（screen.md 3.9）。
// 「Webで見る」（QR）と「バックアップする」（Apple/Google連携、U-13決定）はいずれも
// 「このデータを恒久化・別デバイスへ渡す」という同一目的のため、個別行→WebConnect画面へ
// 遷移させる構成をやめ、設定画面に直接埋め込む（旧構成は両方が同じ画面に着地し、利用者に
// 機能の区別が伝わらなかったため撤廃。ユーザー指摘により統合）。
export function SettingsScreen() {
  const navigation = useRootNavigation();
  // Web版（Expo Web でこの画面自体をブラウザ表示した場合）はQR/バックアップ導線を出さず
  // Webダッシュボードへの案内のみを表示するため、副題も内容に合わせる（ユーザー指摘）。
  const subtitle = Platform.OS === 'web' ? 'Webダッシュボードへの案内' : 'Web連携・バックアップ';
  return (
    <ScreenShell title="設定" subtitle={subtitle} onBack={() => navigation.goBack()}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <WebConnectSection />
        {isAccountDeletionAvailable ? <DeleteAccountSection /> : null}
      </ScrollView>
    </ScreenShell>
  );
}

// Webで見る（QR表示・screen.md 3.10）＋ バックアップ（Apple/Google連携、U-13決定）。
// Web版（Expo Web でこの画面自体をブラウザ表示した場合）は「パソコンで読み取るQR」を
// 表示しても自己矛盾になる（PC上でPC向けQRを表示してしまう）ため、Web ダッシュボード
// （別プロジェクト `web/`。カメラ読取は `web/src/components/QrScanner.tsx` に実装済み）への
// 案内に差し替える（ユーザー指摘により変更）。
function WebConnectSection() {
  const isWeb = Platform.OS === 'web';
  return (
    <View style={styles.section}>
      {isWeb ? <WebAccountRow /> : <QrPairingBody />}
      {isWeb ? <WebDashboardNotice /> : null}
      <AccountLinkSection />
      {/* 「スマホの日記データは…」はネイティブ（QR/バックアップ操作がスマホ側で完結する）向けの
          文言。Web版でもこのまま出すと「スマホ」という前提自体が噛み合わず自己矛盾になるため、
          Web版では出さない（ユーザー指摘）。 */}
      {isWeb ? null : <Text style={styles.footNote}>スマホの日記データはそのまま、安全に保たれます</Text>}
    </View>
  );
}

// Web ダッシュボードへの案内（screen.md 4.2 の /connect）。EXPO_PUBLIC_WEB_URL が
// 設定されていればリンクを開けるようにする。上の WebAccountRow（このブラウザ自体を連携）とは
// 別の目的: こちらは分析・検索など閲覧専用の機能が揃った別アプリへの案内（reviewer指摘を受け、
// 「この画面でも見られるのに別アプリへ誘導される」混乱を減らすため文言を調整）。
function WebDashboardNotice() {
  const webUrl = process.env.EXPO_PUBLIC_WEB_URL;
  const [error, setError] = useState(false);
  return (
    <View style={styles.center}>
      <Text style={styles.prompt}>分析・検索など、より詳しく見るならWebダッシュボード</Text>
      <Text style={styles.promptSub}>
        こちらのブラウザ以外の端末で開く場合は、そちらの設定画面のQRコードをWebダッシュボードのカメラで読み取ってください。
      </Text>
      {webUrl ? (
        <PrimaryButton
          label="Webダッシュボードを開く"
          variant="ghost"
          onPress={() => {
            setError(false);
            Linking.openURL(`${webUrl.replace(/\/+$/, '')}/connect`).catch(() => setError(true));
          }}
        />
      ) : null}
      {error ? <Text style={styles.confirmError}>リンクを開けませんでした。</Text> : null}
    </View>
  );
}

// Web版専用: 未連携（匿名セッション）なら「スマホと連携する」、連携済み（非匿名）なら
// 「ログアウトする」を出し分ける（ユーザー指摘）。いずれも requestWebConnect（サインアウト＋
// 連携画面 WebConnectGate へ戻す）を呼ぶだけでよい設計にしている。
function WebAccountRow() {
  const user = useAuthStore((s) => s.user);
  const requestWebConnect = useAuthStore((s) => s.requestWebConnect);
  const [busy, setBusy] = useState(false);

  // Firebase未設定時はそもそも連携ゲートが機能しない（WebConnectGateはWorker/Firebase前提）ため
  // 導線自体を出さない（reviewer指摘: 出し分けの誤表示・機能しないボタンを避ける防御）。
  if (!user || !isFirebaseConfigured) return null;

  // requestWebConnect は成功時に authStore.status を 'needs-connect' へ変え、App.tsx が
  // WebConnectGate へ切り替わりこの画面自体がアンマウントされる（失敗しても内部で吸収し必ず
  // 遷移する設計＝authStore.ts 参照）。そのため busy を戻す処理は持たない
  // （アンマウント後の setState を避けるため。reviewer指摘を先取り）。
  const onPress = () => {
    setBusy(true);
    void requestWebConnect();
  };

  return (
    <View style={styles.linkSection}>
      {user.isAnonymous ? (
        <>
          <Text style={styles.linkTitle}>スマホと連携する</Text>
          <Text style={styles.linkSub}>書いた日記を、ここでもそのまま読めるようにします。</Text>
          <PrimaryButton label={busy ? '連携画面へ…' : '連携する'} variant="ghost" disabled={busy} onPress={() => void onPress()} />
        </>
      ) : (
        <>
          <Text style={styles.linkTitle}>ログアウトする</Text>
          <Text style={styles.linkSub}>このブラウザでのサインインを終了します。</Text>
          <PrimaryButton label={busy ? 'ログアウトしています…' : 'ログアウト'} variant="ghost" disabled={busy} onPress={() => void onPress()} />
        </>
      )}
    </View>
  );
}

// QRペアリング本体（ネイティブのみ）。createPairingToken で短命トークン（60秒）を発行しQR表示。
// 失効に合わせて自動再発行する。
function QrPairingBody() {
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
    <>
      <Text style={styles.prompt}>パソコンでも、書いた日記をそのまま見られます</Text>
      <Text style={styles.promptSub}>下のコードを、パソコンのブラウザで読み取ってください</Text>
      {body()}
    </>
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

// アカウント削除（data.md 第7章／screen.md 3.9「将来」項目の実装）。
// Worker 未設定（モック運用）では isAccountDeletionAvailable=false のため出さない
// （削除は不可逆なため「削除できたふり」をしない方針、src/services/account.ts）。
function DeleteAccountSection() {
  const navigation = useRootNavigation();
  const signOut = useAuthStore((s) => s.signOut);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const onConfirm = async () => {
    setBusy(true);
    setError(false);
    try {
      await deleteAccount();
    } catch {
      // 削除自体が失敗（サーバ未達等）。再試行できるよう確認UIを維持する。
      setBusy(false);
      setError(true);
      return;
    }
    // 削除済みuidの日記が新セッション確立までの一瞬でも画面に残らないよう、購読を即座に止めて
    // ローカル表示をクリアする（entriesStore.bootstrap は uid 切替時に entries を同期クリアしない
    // ため、ここで明示的に teardown する。reviewer指摘）。
    useEntriesStore.getState().teardown();
    try {
      // 削除済みセッションをクリアし、新しい匿名セッションを確立する（authStore.signOut と同じ経路）。
      await signOut();
      navigation.navigate('MainTabs', { screen: 'Home' });
    } catch {
      // 削除自体は完了済み。再匿名化にのみ失敗した場合は authStore.status が 'error' になり、
      // App.tsx がアプリ全体を再起動案内画面へ切り替える（再起動で initialize() が新しい匿名
      // セッションを確立し復帰できる）。「削除に失敗した」という誤ったメッセージは出さない
      // （reviewer指摘：signOut失敗をdeleteAccount失敗と混同しない）。
      setBusy(false);
    }
  };

  if (!confirming) {
    return (
      <View style={styles.section}>
        <SettingsRow
          label="アカウントを削除する"
          sub="日記・対話・連携情報がすべて削除されます"
          onPress={() => setConfirming(true)}
        />
      </View>
    );
  }

  return (
    <View style={[styles.section, styles.confirmBox]}>
      <ConfirmAnnouncement />
      <Text style={styles.confirmText}>
        本当に削除しますか？この操作は取り消せません。日記・対話・連携情報がすべて削除されます。
      </Text>
      {error ? <Text style={styles.confirmError}>削除に失敗しました。もう一度お試しください。</Text> : null}
      {busy ? (
        <ActivityIndicator color={colors.heavy} />
      ) : (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="本当に削除する"
            onPress={() => void onConfirm()}
            style={({ pressed }) => [styles.dangerButton, pressed && styles.rowPressed]}
          >
            <Text style={styles.dangerButtonLabel}>本当に削除する</Text>
          </Pressable>
          <PrimaryButton
            label="キャンセル"
            variant="ghost"
            onPress={() => {
              setConfirming(false);
              setError(false);
            }}
          />
        </>
      )}
    </View>
  );
}

// 確認UI出現時、スクリーンリーダーに危険な操作であることを能動的に読み上げさせる
// （警告文はタップ後に動的挿入されるため、探索しないと気づかれない。reviewer指摘）。
function ConfirmAnnouncement() {
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      '本当に削除しますか？この操作は取り消せません。日記・対話・連携情報がすべて削除されます。',
    );
  }, []);
  return null;
}

// screen.md 3.9 の .settings-row（タイトル＋サブ文言の行）。
function SettingsRow({ label, sub, onPress }: { label: string; sub: string; onPress: () => void }) {
  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${label}。${sub}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowSub}>{sub}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.xl, paddingBottom: spacing.xl },
  section: { gap: spacing.md },
  row: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paperSoft,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: 3,
  },
  rowPressed: { opacity: 0.85 },
  rowLabel: { fontFamily: fonts.uiBold, fontSize: 14, color: colors.ink },
  rowSub: { fontFamily: fonts.uiRegular, fontSize: 11, color: colors.inkFaint },
  confirmBox: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.heavy,
    backgroundColor: colors.heavySoft,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  confirmText: { fontFamily: fonts.uiRegular, fontSize: 12, lineHeight: 18, color: colors.ink },
  confirmError: { fontFamily: fonts.uiRegular, fontSize: 11, color: colors.heavy },
  dangerButton: {
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.heavy,
  },
  dangerButtonLabel: { fontFamily: fonts.uiBold, fontSize: 14, color: '#ffffff' },
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
