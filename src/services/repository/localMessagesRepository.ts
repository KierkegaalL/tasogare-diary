import AsyncStorage from '@react-native-async-storage/async-storage';

import type { MessagesRepository } from './types';
import type { ChatMessage } from '../../types/diary';

// ローカル（AsyncStorage）実装。Firebase 未設定時の既定。(uid, entryId) ごとにキーを分ける。
const keyFor = (uid: string, entryId: string) => `tasogare-messages:${uid}:${entryId}`;

type Listener = (messages: ChatMessage[]) => void;
const listeners = new Map<string, Set<Listener>>();

async function read(uid: string, entryId: string): Promise<ChatMessage[]> {
  const raw = await AsyncStorage.getItem(keyFor(uid, entryId));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ChatMessage[];
  } catch {
    return [];
  }
}

async function write(uid: string, entryId: string, messages: ChatMessage[]): Promise<void> {
  await AsyncStorage.setItem(keyFor(uid, entryId), JSON.stringify(messages));
}

async function notify(uid: string, entryId: string): Promise<void> {
  const key = keyFor(uid, entryId);
  const current = await read(uid, entryId);
  listeners.get(key)?.forEach((cb) => cb(current));
}

export const localMessagesRepository: MessagesRepository = {
  subscribe(uid, entryId, onChange) {
    const key = keyFor(uid, entryId);
    const set = listeners.get(key) ?? new Set<Listener>();
    set.add(onChange);
    listeners.set(key, set);
    read(uid, entryId).then(onChange);
    return () => {
      listeners.get(key)?.delete(onChange);
    };
  },
  async add(uid, entryId, message) {
    const arr = await read(uid, entryId);
    await write(uid, entryId, [...arr, message]); // 作成順（末尾追加）
    await notify(uid, entryId);
  },
  async remove(uid, entryId, messageId) {
    const next = (await read(uid, entryId)).filter((m) => m.id !== messageId);
    await write(uid, entryId, next);
    await notify(uid, entryId);
  },
};
