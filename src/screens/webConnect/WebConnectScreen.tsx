import React from 'react';

import { useRootNavigation } from '../../app/navigation/hooks';
import { ScreenShell } from '../../components/ScreenShell';

// ⑨ Webで見る（QR表示 / screen.md 3.10）。
// TODO(実装): createPairingToken→QR 表示（60秒更新）＋Apple/Google サインイン代替。
export function WebConnectScreen() {
  const navigation = useRootNavigation();
  return (
    <ScreenShell
      title="Webで見る"
      subtitle="QRコード表示（60秒更新・実装予定）"
      onBack={() => navigation.goBack()}
    />
  );
}
