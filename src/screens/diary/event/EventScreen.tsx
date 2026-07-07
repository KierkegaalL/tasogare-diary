import React from 'react';

import { useDiaryFlowNavigation } from '../../../app/navigation/hooks';
import { useDraftStore } from '../../../stores/draftStore';
import { SingleWordStep } from '../SingleWordStep';

const EVENT_CHIPS = ['カフェ', '仕事', '友達と', '読書', '家でゆっくり', '外出'];

// ③ できごと（step2 / screen.md 3.3）。できごとを1つ選び draftStore に category='event' で保持。
export function EventScreen() {
  const navigation = useDiaryFlowNavigation();
  const mood = useDraftStore((s) => s.mood);
  const eventWord = useDraftStore((s) => s.words.find((w) => w.category === 'event')?.text);
  const setEventWord = useDraftStore((s) => s.setEventWord);

  return (
    <SingleWordStep
      stepIndex={1}
      stepLabel="できごと"
      prompt="今日は何をしていましたか？"
      promptSub="簡単に、一言で"
      placeholder="カフェに行った、とか、家にいた、とか"
      chipLabel="こんな一日でしたか？"
      chips={EVENT_CHIPS}
      selected={eventWord}
      recap={mood ? [{ label: '気持ち', value: mood }] : undefined}
      onSelect={(word, source) => setEventWord(word, source)}
      onClear={() => setEventWord(undefined)}
      onBack={() => navigation.goBack()}
      onNext={() => navigation.navigate('Words')}
      onSkip={() => {
        setEventWord(undefined);
        navigation.navigate('Words');
      }}
    />
  );
}
