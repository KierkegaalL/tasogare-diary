import React from 'react';

import { useRootNavigation } from '../../app/navigation/hooks';
import { ScreenShell } from '../../components/ScreenShell';
import { PrimaryButton } from '../../components/PrimaryButton';

// ⑧ 設定（screen.md 3.9）。
export function SettingsScreen() {
  const navigation = useRootNavigation();
  return (
    <ScreenShell title="設定" subtitle="Web連携・バックアップ" onBack={() => navigation.goBack()}>
      <PrimaryButton label="Webで見る" variant="ghost" onPress={() => navigation.navigate('WebConnect')} />
    </ScreenShell>
  );
}
