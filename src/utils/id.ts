// クライアント側の一意ID。実サービスでは Firestore の自動ID を用いる（data.md 3.2）。
export function makeId(prefix = 'e'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
