import React from 'react';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';

import type { RootStackParamList } from '../../app/navigation/types';
import { useRootNavigation } from '../../app/navigation/hooks';
import { ScreenShell } from '../../components/ScreenShell';

// ⑦ 詳細＋AI対話（screen.md 3.8）。
// TODO(実装): 本文表示＋タグ＋感情バッジ、AI対話（chat）を実装。
export function DetailScreen() {
  const navigation = useRootNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'Detail'>>();
  return (
    <ScreenShell
      title="日記の詳細"
      subtitle={`entryId: ${route.params.entryId}（実装予定）`}
      onBack={() => navigation.goBack()}
    />
  );
}
