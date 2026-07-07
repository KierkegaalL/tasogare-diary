import React from 'react';

import { useDiaryFlowNavigation } from '../../../app/navigation/hooks';
import { ScreenShell } from '../../../components/ScreenShell';
import { StepProgress } from '../../../components/StepProgress';
import { PrimaryButton } from '../../../components/PrimaryButton';
import { useDraftStore } from '../../../stores/draftStore';

// ⑤ たしかめる（step4 / screen.md 3.5）。生成文プレビュー→保存→灯の演出。
// TODO(実装): generateDiary で本文生成→note-card 表示→調整（もっと前向きに/短くして/詳しく/選び直す）→
//             Firestore へ保存→「灯」の演出（architecture.md 8.2）。ここでは下書きをリセットしてホームへ戻す暫定実装。
export function PreviewScreen() {
  const navigation = useDiaryFlowNavigation();
  const reset = useDraftStore((s) => s.reset);

  const onSave = () => {
    reset();
    navigation.navigate('MainTabs', { screen: 'Home' });
  };

  return (
    <ScreenShell
      title="たしかめる"
      subtitle="生成された日記を確認して保存"
      onBack={() => navigation.goBack()}
      headerContent={<StepProgress current={3} label="たしかめる" />}
    >
      <PrimaryButton label="保存する" onPress={onSave} />
    </ScreenShell>
  );
}
