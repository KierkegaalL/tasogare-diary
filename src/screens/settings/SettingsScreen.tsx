import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useRootNavigation } from '../../app/navigation/hooks';
import { ScreenShell } from '../../components/ScreenShell';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useLinkableAccountKinds } from '../../hooks/useAccountLink';
import { deleteAccount, isAccountDeletionAvailable } from '../../services/account';
import { useAuthStore } from '../../stores/authStore';
import { useEntriesStore } from '../../stores/entriesStore';
import { colors, fonts, radius, spacing } from '../../theme';

// ⑧ 設定（screen.md 3.9）。
// 「バックアップする」は独立機能ではなく、Apple/Google アカウント連携（U-13決定）の入口。
// 連携UI（AccountLinkSection）は WebConnect 画面側にあるためそこへ遷移する（実装の重複を避ける）。
export function SettingsScreen() {
  const navigation = useRootNavigation();
  // 連携が実際にできない環境（既定のExpo Go・導入済みユーザー等）では、遷移しても
  // AccountLinkSection が何も描画せず「押しても何も起きない」導線になるため行自体を出さない
  // （WebConnectScreen の AccountLinkSection と同じ「未対応の空UIを出さない」原則。reviewer指摘）。
  const canBackup = useLinkableAccountKinds().length > 0;
  return (
    <ScreenShell title="設定" subtitle="Web連携・バックアップ" onBack={() => navigation.goBack()}>
      <SettingsRow
        label="Webで見る"
        sub="パソコンから日記を見られるようにする"
        onPress={() => navigation.navigate('WebConnect')}
      />
      {canBackup ? (
        <SettingsRow
          label="バックアップする"
          sub="機種変更・削除に備えてアカウントを保存"
          onPress={() => navigation.navigate('WebConnect')}
        />
      ) : null}
      {isAccountDeletionAvailable ? <DeleteAccountSection /> : null}
    </ScreenShell>
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
      <SettingsRow
        label="アカウントを削除する"
        sub="日記・対話・連携情報がすべて削除されます"
        onPress={() => setConfirming(true)}
      />
    );
  }

  return (
    <View style={styles.confirmBox}>
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
});
