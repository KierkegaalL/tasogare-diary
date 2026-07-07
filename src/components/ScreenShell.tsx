import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, spacing } from '../theme';

interface ScreenShellProps {
  title: string;
  subtitle?: string;
  /** 指定時、ヘッダーに戻るボタン（visual-design.html .back-btn）を表示。 */
  onBack?: () => void;
  /** ヘッダー右側に置く要素（例: StepProgress）。 */
  headerContent?: React.ReactNode;
  children?: React.ReactNode;
}

// スキャフォールド用の共通レイアウト（screen.md §0.2 の .screen-header 相当を含む）。
// 各画面の詳細は screen.md に沿って実装フェーズで肉付けする。
export function ScreenShell({ title, subtitle, onBack, headerContent, children }: ScreenShellProps) {
  const hasHeader = Boolean(onBack) || Boolean(headerContent);
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {hasHeader ? (
        <View style={styles.header}>
          {onBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="戻る"
              onPress={onBack}
              style={styles.backBtn}
            >
              <Text style={styles.backIcon}>←</Text>
            </Pressable>
          ) : null}
          {headerContent}
        </View>
      ) : null}
      <View style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <View style={styles.body}>{children}</View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  backBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paperSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: { fontSize: 14, color: colors.inkSoft },
  content: { flex: 1, padding: spacing.lg },
  title: { fontFamily: fonts.display, fontSize: 18, color: colors.duskDeep, marginBottom: spacing.xs },
  subtitle: { fontFamily: fonts.uiRegular, fontSize: 12, color: colors.inkFaint, marginBottom: spacing.lg },
  body: { flex: 1, gap: spacing.md },
});
