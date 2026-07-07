import React from 'react';

import { useDiaryFlowNavigation } from '../../../app/navigation/hooks';
import { ScreenShell } from '../../../components/ScreenShell';
import { StepProgress } from '../../../components/StepProgress';
import { PrimaryButton } from '../../../components/PrimaryButton';

// ③ できごと（step2 / screen.md 3.3）。
// TODO(実装): 一言入力＋候補チップを実装し、draftStore.addWord（category='event'）で保持する。
export function EventScreen() {
  const navigation = useDiaryFlowNavigation();
  return (
    <ScreenShell
      title="今日は何をしていましたか？"
      subtitle="簡単に、一言で"
      onBack={() => navigation.goBack()}
      headerContent={<StepProgress current={1} label="できごと" />}
    >
      <PrimaryButton label="次へ →" onPress={() => navigation.navigate('Words')} />
    </ScreenShell>
  );
}
