// 環境変数の取得ヘルパー。
// CLIやダッシュボード経由の設定でBOM・改行・空白が混入する事故が実際に起きるため
// (SR Assistで実証済み)、参照は必ずここを通す。
export function env(name: string): string | undefined {
  const v = process.env[name];
  if (!v) return undefined;
  const cleaned = v.replace(/^﻿/, "").trim();
  return cleaned.length > 0 ? cleaned : undefined;
}
