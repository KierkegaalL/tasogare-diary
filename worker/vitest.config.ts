import { defineConfig } from 'vitest/config';

// Worker のユニットテスト設定。llm/gemini（fetch モック）・llm セレクタ・auth（jose モック）等の
// 純ロジックを Node 環境で検証する。Workers ランタイム固有 API は使わないため node 環境で十分。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
