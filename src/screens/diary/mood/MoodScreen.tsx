import React from 'react';

import { useDiaryFlowNavigation } from '../../../app/navigation/hooks';
import { ScreenShell } from '../../../components/ScreenShell';
import { StepProgress } from '../../../components/StepProgress';
import { PrimaryButton } from '../../../components/PrimaryButton';

// ② きもち（step1 / screen.md 3.2）。
// TODO(実装): 一言入力＋候補チップ（.pebble）を実装し、draftStore.setMood で保持する。
export function MoodScreen() {
  const navigation = useDiaryFlowNavigation();
  return (
    <ScreenShell
      title="今、どんな気持ちですか？"
      subtitle="一言で大丈夫です"
      onBack={() => navigation.goBack()}
      headerContent={<StepProgress current={0} label="きもち" />}
    >
      <PrimaryButton label="次へ →" onPress={() => navigation.navigate('Event')} />
    </ScreenShell>
  );
}
