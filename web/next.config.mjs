import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// 共有パッケージ（../shared）を取り込むため、ワークスペースルートはリポジトリルート
// （web/ の親）に固定する。web/ に絞ると shared がルート外になり解決できない。
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Firebase Hosting へ静的エクスポート（SSR 不要・振り返り専用 / architecture.md 第6章 案A）。
  output: 'export',
  // ルートに別 lockfile があるため、ワークスペースルートを明示して誤検出の警告を避ける。
  turbopack: { root: repoRoot },
  images: { unoptimized: true },
};

export default nextConfig;
