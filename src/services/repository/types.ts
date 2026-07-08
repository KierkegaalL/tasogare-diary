import type { DiaryEntry } from '../../types/diary';

// 日記エントリの永続化リポジトリ。ローカル（AsyncStorage）/ Firestore を差し替える。
// すべて uid スコープ（data.md 第6章）。
export interface EntriesRepository {
  /** uid の全エントリを購読する。呼び出し時に現在値を1回通知し、以後の変更でも通知する。 */
  subscribe(uid: string, onChange: (entries: DiaryEntry[]) => void): () => void;
  /**
   * 追加/更新。id は自動生成（data.md 3.2）。1日1件（U-11）は `date` で担保し、
   * 同一 date の既存エントリがあれば id/createdAt を維持して更新する（スキーマ上は複数許容）。
   */
  upsert(uid: string, entry: DiaryEntry): Promise<void>;
  remove(uid: string, id: string): Promise<void>;
}
