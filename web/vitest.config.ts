import { defineConfig } from 'vitest/config';
import path from 'node:path';

// web/ は Next.js（別npmプロジェクト）。純粋なTSロジック（src/lib配下等）のユニットテストのみを
// 対象とし、React/DOMコンポーネント（QRスキャナ・無限スクロール等）は手動確認のまま残す
// （ブラウザAPI依存が大きく、テスト環境構築のコストに見合わないため。web/README.md参照）。
export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
});
