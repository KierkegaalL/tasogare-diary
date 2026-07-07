import React from 'react';

import { useDiaryFlowNavigation } from '../../../app/navigation/hooks';
import { ScreenShell } from '../../../components/ScreenShell';
import { StepProgress } from '../../../components/StepProgress';
import { PrimaryButton } from '../../../components/PrimaryButton';

// ④ ことば（step3 / screen.md 3.4）。
// TODO(実装): Claude API（suggestWords）で連想語を提案し、選択/除外/自由追加を draftStore.addWord で保持する。
export function WordsScreen() {
  const navigation = useDiaryFlowNavigation();
  return (
    <ScreenShell
      title="そこから、こんな言葉も浮かびました"
      subtitle="気になるものを選んでみてください"
      onBack={() => navigation.goBack()}
      headerContent={<StepProgress current={2} label="ことば" />}
    >
      <PrimaryButton label="文章にする →" onPress={() => navigation.navigate('Preview')} />
    </ScreenShell>
  );
}
