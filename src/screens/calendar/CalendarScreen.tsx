import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useRootNavigation } from '../../app/navigation/hooks';
import { useEntriesStore } from '../../stores/entriesStore';
import { OrbMini } from '../../components/OrbMini';
import { generateInsight } from '../../services/diaryApi';
import type { GenerateInsightResponse } from '../../services/diaryApi';
import type { MoodLevel } from '../../theme';
import { colors, fonts, moodColor, moodLabel, radius, spacing } from '../../theme';
import type { DiaryEntry } from '../../types/diary';
import { formatYearMonth, isoWeekKey, monthGrid, todayISO, weekdayJa, ymd } from '../../utils/date';
import { buildMoodByDate } from '../../utils/entries';

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];
const LEGEND: MoodLevel[] = ['calm', 'tender', 'heavy'];

type ViewMode = 'calendar' | 'list';

// ⑥ カレンダー/一覧（screen.md 3.7）。
export function CalendarScreen() {
  const navigation = useRootNavigation();
  const entries = useEntriesStore((s) => s.entries);
  const [mode, setMode] = useState<ViewMode>('calendar');
  const [query, setQuery] = useState('');

  const moodByDate = useMemo(() => buildMoodByDate(entries), [entries]);
  const cells = useMemo(() => monthGrid(todayISO()), []);

  const openEntry = (date: string) => {
    const entry = entries.find((e) => e.date === date);
    if (entry) navigation.navigate('Detail', { entryId: entry.id });
  };
  // EntryRow（React.memo）の props を安定させ、検索入力毎の再レンダーで仮想化の恩恵が薄れないようにする。
  const openEntryById = useCallback((id: string) => navigation.navigate('Detail', { entryId: id }), [navigation]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerPlain}>
        <Text style={styles.appTitle}>過去の日記</Text>
        <View style={styles.toggle}>
          <ToggleTab label="カレンダー" active={mode === 'calendar'} onPress={() => setMode('calendar')} />
          <ToggleTab label="リスト" active={mode === 'list'} onPress={() => setMode('list')} />
        </View>
      </View>

      {mode === 'calendar' ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.monthLabel}>{formatYearMonth(todayISO())}</Text>
          <View style={styles.weekdayRow}>
            {WEEKDAYS.map((w) => (
              <Text key={w} style={styles.weekday}>
                {w}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {cells.map((iso, i) => {
              if (!iso) return <View key={`blank-${i}`} style={styles.cell} />;
              const mood = moodByDate.get(iso) ?? null;
              return (
                <Pressable
                  key={iso}
                  style={styles.cell}
                  disabled={!mood}
                  onPress={() => openEntry(iso)}
                  accessibilityRole="button"
                >
                  <Text style={styles.cellDay}>{ymd(iso).d}</Text>
                  {mood ? (
                    <View style={styles.cellOrb}>
                      <OrbMini size={7} color={moodColor(mood)} />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.legend}>
            {LEGEND.map((m) => (
              <View key={m} style={styles.legendItem}>
                <OrbMini size={9} color={moodColor(m)} />
                <Text style={styles.legendText}>{moodLabel(m)}</Text>
              </View>
            ))}
          </View>

          <WeeklyInsightCard hasEntries={entries.length > 0} />
        </ScrollView>
      ) : (
        <ListView entries={entries} query={query} onQuery={setQuery} onOpen={openEntryById} />
      )}
    </SafeAreaView>
  );
}

// AI週次インサイト（.insight-card / screen.md 3.7）。
// 今週分を generateInsight（api-contract.md 3.5）で取得する。サーバ側でキャッシュされるため、
// 表示のたびに生成が走るわけではない（進行中の週は1時間で作り直し）。
// 日記が1件も無い期間はサーバが failed-precondition を返す仕様のため、その場合は何も出さない。
function WeeklyInsightCard({ hasEntries }: { hasEntries: boolean }) {
  const [insight, setInsight] = useState<GenerateInsightResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // 取得は数秒かかる。応答前にアンマウントされたら setState しない。
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await generateInsight({ type: 'weekly', periodKey: isoWeekKey() });
      if (!mounted.current) return;
      setInsight(res);
    } catch {
      // 「今週まだ日記が無い」「オフライン」等はカードを出さないだけに留める（画面を汚さない）。
      if (!mounted.current) return;
      setInsight(null);
      setFailed(true);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  // 日記が1件も無いうちは呼ばない（確実に failed-precondition になるため）。
  // effect 本体での同期 setState を避けるため macrotask に逃がす（react-hooks/set-state-in-effect）。
  useEffect(() => {
    mounted.current = true;
    if (!hasEntries) return;
    const id = setTimeout(() => void load(), 0);
    return () => clearTimeout(id);
  }, [hasEntries, load]);

  // アンマウント時のみ false にする（上の effect は hasEntries 変化でも再実行されるため分ける）。
  useEffect(() => () => { mounted.current = false; }, []);

  if (!hasEntries || failed) return null;
  if (loading && !insight) {
    return (
      <View style={styles.insightCard}>
        <ActivityIndicator color={colors.dusk} />
      </View>
    );
  }
  if (!insight) return null;

  return (
    <View style={styles.insightCard}>
      <Text style={styles.insightTitle}>今週の傾向</Text>
      <Text style={styles.insightBody}>{insight.narrative}</Text>
      {insight.topWords.length > 0 ? (
        <View style={styles.tagsRow}>
          {insight.topWords.slice(0, 4).map((w) => (
            <Text key={w.word} style={styles.tag}>
              {w.word} {w.count}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ToggleTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }} style={[styles.toggleTab, active && styles.toggleTabOn]}>
      <Text style={[styles.toggleText, active && styles.toggleTextOn]}>{label}</Text>
    </Pressable>
  );
}

interface MonthSection {
  title: string;
  data: DiaryEntry[];
}

// 過去の日記一覧（constraints.md: 大量データでも軽量に保つため仮想化）。月ごとの見出しを持つため
// SectionList（FlatList 系の仮想化リスト。表示中の項目のみマウントする）で実装する。
function ListView({
  entries,
  query,
  onQuery,
  onOpen,
}: {
  entries: DiaryEntry[];
  query: string;
  onQuery: (q: string) => void;
  onOpen: (id: string) => void;
}) {
  const hasHydrated = useEntriesStore((s) => s.hasHydrated);
  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return entries;
    return entries.filter(
      (e) => e.bodyText.includes(q) || e.words.some((w) => w.text.includes(q)),
    );
  }, [entries, query]);

  // 月ごとに区切る（entries は新しい順）。
  const sections = useMemo<MonthSection[]>(() => {
    const map = new Map<string, DiaryEntry[]>();
    for (const e of filtered) {
      const key = formatYearMonth(e.date);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
  }, [filtered]);

  return (
    <SectionList
      sections={sections}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={onQuery}
          placeholder="キーワードで検索…"
          placeholderTextColor={colors.inkFaint}
        />
      }
      ListEmptyComponent={
        hasHydrated ? (
          <Text style={styles.empty}>{entries.length === 0 ? 'まだ日記がありません。' : '該当する日記がありません。'}</Text>
        ) : null
      }
      renderSectionHeader={({ section }) => <Text style={styles.monthDivider}>{section.title}</Text>}
      renderItem={({ item }) => <EntryRow entry={item} onOpen={onOpen} />}
    />
  );
}

// SectionList の仮想化と合わせ、非表示範囲外の行の不要な再計算を抑える（reviewer所見）。
const EntryRow = React.memo(function EntryRow({
  entry,
  onOpen,
}: {
  entry: DiaryEntry;
  onOpen: (id: string) => void;
}) {
  return (
    <Pressable style={styles.listEntry} onPress={() => onOpen(entry.id)} accessibilityRole="button">
      <View style={styles.listDate}>
        <Text style={styles.listDay}>{ymd(entry.date).d}</Text>
        <Text style={styles.listDow}>{weekdayJa(entry.date)}</Text>
      </View>
      <View style={styles.listBody}>
        <Text style={styles.listText} numberOfLines={2}>
          {entry.bodyText}
        </Text>
        <View style={styles.tagsRow}>
          {entry.words.slice(0, 4).map((w) => (
            <Text key={`${entry.id}-${w.text}`} style={styles.tag}>
              {w.text}
            </Text>
          ))}
        </View>
      </View>
      <OrbMini size={10} color={entry.mood ? moodColor(entry.mood) : colors.line} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  headerPlain: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xs },
  appTitle: { fontFamily: fonts.display, fontSize: 15, color: colors.duskDeep },
  toggle: { flexDirection: 'row', gap: 6, marginTop: spacing.md },
  toggleTab: { borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingVertical: 5, paddingHorizontal: 13 },
  toggleTabOn: { backgroundColor: colors.dusk, borderColor: colors.dusk },
  toggleText: { fontFamily: fonts.uiRegular, fontSize: 10.5, color: colors.inkFaint },
  toggleTextOn: { color: '#ffffff' },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  monthLabel: { fontFamily: fonts.uiRegular, fontSize: 11, color: colors.inkFaint, marginBottom: spacing.md },
  weekdayRow: { flexDirection: 'row', marginBottom: spacing.sm },
  weekday: { flex: 1, textAlign: 'center', fontFamily: fonts.uiRegular, fontSize: 9.5, color: colors.inkFaint },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellDay: { fontFamily: fonts.uiRegular, fontSize: 9, color: colors.inkFaint },
  cellOrb: { position: 'absolute', bottom: 6, right: 8 },
  insightCard: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paperSoft,
    gap: spacing.sm,
  },
  insightTitle: { fontFamily: fonts.display, fontSize: 12, color: colors.duskDeep },
  insightBody: { fontFamily: fonts.display, fontSize: 12.5, lineHeight: 20, color: colors.ink },
  legend: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendText: { fontFamily: fonts.uiRegular, fontSize: 10, color: colors.inkSoft },
  search: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 15,
    fontSize: 12,
    fontFamily: fonts.uiRegular,
    backgroundColor: colors.paperSoft,
    color: colors.ink,
    marginBottom: spacing.lg,
  },
  monthDivider: {
    fontFamily: fonts.uiRegular,
    fontSize: 10.5,
    color: colors.inkFaint,
    paddingBottom: 7,
    marginBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  listEntry: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  listDate: { width: 32, alignItems: 'center' },
  listDay: { fontFamily: fonts.display, fontSize: 17, color: colors.ink },
  listDow: { fontFamily: fonts.uiRegular, fontSize: 9, color: colors.inkFaint, marginTop: 3 },
  listBody: { flex: 1, gap: 7 },
  listText: { fontFamily: fonts.display, fontSize: 12.5, lineHeight: 19, color: colors.ink },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  tag: { fontFamily: fonts.uiRegular, fontSize: 9, color: colors.inkFaint, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingVertical: 2, paddingHorizontal: 8 },
  empty: { fontFamily: fonts.uiRegular, fontSize: 12, color: colors.inkFaint, lineHeight: 20 },
});
