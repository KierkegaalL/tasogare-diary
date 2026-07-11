import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useRootNavigation } from '../../app/navigation/hooks';
import { ScreenShell } from '../../components/ScreenShell';
import { useLinkableAccountKinds } from '../../hooks/useAccountLink';
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
    </ScreenShell>
  );
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
});
