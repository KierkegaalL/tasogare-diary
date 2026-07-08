import AsyncStorage from '@react-native-async-storage/async-storage';

import type { EntriesRepository } from './types';
import type { DiaryEntry } from '../../types/diary';

// ローカル（AsyncStorage）実装。Firebase 未設定時の既定。uid ごとにキーを分ける。
const keyFor = (uid: string) => `tasogare-entries:${uid}`;

type Listener = (entries: DiaryEntry[]) => void;
const listeners = new Map<string, Set<Listener>>();

async function read(uid: string): Promise<DiaryEntry[]> {
  const raw = await AsyncStorage.getItem(keyFor(uid));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as DiaryEntry[];
  } catch {
    return [];
  }
}

async function write(uid: string, entries: DiaryEntry[]): Promise<void> {
  await AsyncStorage.setItem(keyFor(uid), JSON.stringify(entries));
}

async function notify(uid: string): Promise<void> {
  const current = await read(uid);
  listeners.get(uid)?.forEach((cb) => cb(current));
}

export const localEntriesRepository: EntriesRepository = {
  subscribe(uid, onChange) {
    const set = listeners.get(uid) ?? new Set<Listener>();
    set.add(onChange);
    listeners.set(uid, set);
    read(uid).then(onChange);
    return () => {
      listeners.get(uid)?.delete(onChange);
    };
  },
  async upsert(uid, entry) {
    const arr = await read(uid);
    // 1日1件（U-11）: 同一 date の既存エントリは id/createdAt を維持して更新する。
    const existing = arr.find((e) => e.date === entry.date);
    const merged = existing ? { ...entry, id: existing.id, createdAt: existing.createdAt } : entry;
    const rest = arr.filter((e) => e.date !== entry.date);
    await write(uid, [merged, ...rest]); // 新しい順（先頭）
    await notify(uid);
  },
  async remove(uid, id) {
    const next = (await read(uid)).filter((e) => e.id !== id);
    await write(uid, next);
    await notify(uid);
  },
};
