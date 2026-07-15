import React from 'react';

import { useDiaryFlowNavigation } from '../../../app/navigation/hooks';
import { useDraftStore } from '../../../stores/draftStore';
import { SingleWordStep } from '../SingleWordStep';

const MOOD_CHIPS = ['疲れた', '嬉しかった', 'なんとなく', '穏やか', 'もやもや', 'ホッとした'];

// ② きもち（step1 / screen.md 3.2）。一言入力 or 候補チップで気持ちを1つ選ぶ。
export function MoodScreen() {
  const navigation = useDiaryFlowNavigation();
  const mood = useDraftStore((s) => s.mood);
  const setMood = useDraftStore((s) => s.setMood);

  return (
    <SingleWordStep
      stepIndex={0}
      stepLabel="きもち"
      prompt="今、どんな気持ちですか？"
      promptSub="一言で大丈夫です"
      placeholder="疲れた、とか、なんとなく、とか"
      chipLabel="言葉が浮かばないときは"
      chips={MOOD_CHIPS}
      selected={mood}
      onSelect={(word) => setMood(word)}
      onClear={() => setMood(undefined)}
      onBack={() => navigation.goBack()}
      onNext={() => navigation.navigate('Event')}
      onSkip={() => {
        setMood(undefined);
        navigation.navigate('Event');
      }}
    />
  );
}
