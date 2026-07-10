import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'たそがれ日記 — 振り返りダッシュボード',
  description: '書いた日記を、パソコンでそのまま振り返るためのダッシュボード（閲覧専用）。',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
