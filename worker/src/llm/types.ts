// LLM プロバイダ非依存の型・インターフェース・共通エラー。
// プロバイダ（現在は Gemini）を将来別 API（Anthropic 等）へ差し替える際に、呼び出し側（index.ts）を
// 変更せずに済ませるための抽象。各プロバイダ実装は LlmProvider を満たすように書く。

// api-contract.md 1.4 のエラーコードに準拠した HTTP エラー（Worker 共通。LLM 以外の機能でも使う）。
export type ApiErrorCode =
  | 'invalid-argument'
  | 'unauthenticated'
  | 'resource-exhausted'
  | 'unavailable'
  | 'deadline-exceeded'
  | 'permission-denied'
  | 'failed-precondition'
  | 'internal';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

// 用途（モデル階層）。実際のモデル ID は各プロバイダが env から解決する（呼び出し側はモデル名を知らない）。
// interactive: 連想語提案 / 調整 / 対話（低遅延・低コスト優先）
// generate:    日記文生成 / まとめ（品質優先）
export type LlmPurpose = 'interactive' | 'generate';

// プロバイダ非依存の対話履歴ロール。各プロバイダが自社のロール名（例: Gemini は model/user）へ写像する。
export type LlmRole = 'user' | 'assistant';
export interface LlmHistoryEntry {
  role: LlmRole;
  text: string;
}

export interface LlmCallOptions {
  // どのモデル階層で呼ぶか（実モデル ID の解決はプロバイダの責務）。
  purpose: LlmPurpose;
  system: string;
  userText: string;
  history?: LlmHistoryEntry[];
  maxTokens?: number;
  // 構造化出力のスキーマ。OpenAPI 3.0 風のサブセット（type/properties/items/enum/required/description、
  // および nullable: true）で記述する。各プロバイダが自社の構造化出力形式へ変換する責務を負う
  // （例: Gemini は responseSchema にそのまま渡せるが、JSON Schema draft 系のプロバイダでは
  //  nullable → type 配列などへ変換が必要）。
  jsonSchema?: Record<string, unknown>;
}

// LLM プロバイダの共通インターフェース。差し替え時はこのインターフェースを満たす実装を追加する。
export interface LlmProvider {
  readonly name: string;
  // テキスト応答を返す（chat / chatOpening 用）。
  callText(opts: LlmCallOptions): Promise<string>;
  // 構造化 JSON 応答をパースして返す（suggestWords / generateDiary / adjustDiary 用）。
  callJson<T>(opts: LlmCallOptions): Promise<T>;
}
