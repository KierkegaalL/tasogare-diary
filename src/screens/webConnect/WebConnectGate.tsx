import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '../../components/PrimaryButton';
import { useAuthStore } from '../../stores/authStore';
import { getAuthProvider } from '../../services/auth';
import { extractPairingToken, signInWithPairingToken } from '../../services/pairing';
import { signInWithGoogleWeb } from '../../services/auth/webOAuth';
import { colors, fonts, radius, spacing } from '../../theme';
import { QrCameraScanner } from './QrCameraScanner';

// Web版（Platform.OS === 'web' でこの画面自体をブラウザ表示した場合）専用の連携ゲート。
// 起動時に既存セッションが無ければ authStore.status が 'needs-connect' になり、App.tsx から
// RootNavigator の代わりにこの画面が表示される。web/ の /connect（別プロジェクト）と同じ発想
// （QRカメラ読取／コード貼り付け／Googleサインイン／サインインせず利用する）を、モバイルの
// Web ビルド自身に実装する（ユーザー指摘: Webとモバイルで同じ日記を見られるようにするため）。
export function WebConnectGate() {
  const completeConnect = useAuthStore((s) => s.completeConnect);
  const [scanning, setScanning] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function connectWithRaw(raw: string) {
    setError('');
    const token = extractPairingToken(raw);
    if (!token) {
      setError('コードを入力してください。');
      return;
    }
    setBusy(true);
    try {
      const user = await signInWithPairingToken(token);
      completeConnect(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : '連携に失敗しました。');
      setBusy(false);
    }
  }

  function handleDecode(text: string) {
    setScanning(false);
    void connectWithRaw(text);
  }

  async function handleGoogle() {
    setError('');
    setBusy(true);
    try {
      const user = await signInWithGoogleWeb();
      completeConnect(user);
    } catch (err) {
      // ユーザーによるポップアップキャンセルは静かに戻す。
      const code = (err as { code?: string })?.code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setError('サインインに失敗しました。');
      }
      setBusy(false);
    }
  }

  async function handleGuest() {
    setError('');
    setBusy(true);
    try {
      const user = await getAuthProvider().signIn();
      completeConnect(user);
    } catch {
      setError('利用の開始に失敗しました。再度お試しください。');
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>スマホと連携する</Text>
        <Text style={styles.sub}>
          スマホアプリの設定画面に表示されるQRコードをカメラで読み取るか、コード（URL）を貼り付けてください。
        </Text>

        {scanning ? (
          <QrCameraScanner onDecode={handleDecode} onClose={() => setScanning(false)} />
        ) : (
          <PrimaryButton label="カメラで読み取る" variant="ghost" onPress={() => setScanning(true)} disabled={busy} />
        )}

        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="https://tasogare-diary.app/pair?token=… または コード"
          placeholderTextColor={colors.inkFaint}
          style={styles.input}
          editable={!busy}
          accessibilityLabel="ペアリングコード"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <PrimaryButton
          label={busy ? '連携しています…' : 'つなぐ'}
          onPress={() => void connectWithRaw(input)}
          disabled={busy}
        />

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>または</Text>
          <View style={styles.dividerLine} />
        </View>

        <PrimaryButton label="Google でサインイン" variant="ghost" onPress={() => void handleGoogle()} disabled={busy} />
        <View style={[styles.appleButton, busy && styles.appleButtonDisabled]}>
          <Text style={styles.appleLabel}>Apple でサインイン</Text>
        </View>
        <Text style={styles.note}>
          Apple でのサインインは現在未実装のため利用できません。今後対応予定です。
        </Text>

        <View style={styles.guestBox}>
          {busy ? (
            <ActivityIndicator color={colors.dusk} />
          ) : (
            <PrimaryButton label="サインインせずに利用する" variant="ghost" onPress={() => void handleGuest()} />
          )}
          <Text style={styles.guestNote}>あとから設定画面でいつでもスマホと連携できます。</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.duskDeep, textAlign: 'center' },
  sub: { fontFamily: fonts.uiRegular, fontSize: 12, color: colors.inkSoft, textAlign: 'center', marginBottom: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    fontFamily: fonts.uiRegular,
    fontSize: 13,
    color: colors.ink,
    backgroundColor: colors.paper,
  },
  error: { fontFamily: fonts.uiRegular, fontSize: 12, color: colors.heavy },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.xs },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.line },
  dividerText: { fontFamily: fonts.uiRegular, fontSize: 11, color: colors.inkFaint },
  appleButton: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.paperSoft,
  },
  appleButtonDisabled: { opacity: 0.5 },
  appleLabel: { fontFamily: fonts.uiBold, fontSize: 14, color: colors.inkSoft },
  note: { fontFamily: fonts.uiRegular, fontSize: 11, color: colors.inkFaint, textAlign: 'center' },
  guestBox: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    alignItems: 'center',
    gap: spacing.sm,
  },
  guestNote: { fontFamily: fonts.uiRegular, fontSize: 11, color: colors.inkFaint, textAlign: 'center' },
});
