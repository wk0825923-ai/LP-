"use client";

// LP秘書 スコープ5: LP健康診断の入口(公開・無料リードマグネット)
// URLを入れると即座に技術診断→結果をその場に表示。保存できていれば共有リンクも出す。

import { useState } from "react";
import { renderMarkdown } from "@/lib/markdown";
import "./diagnose.css";

interface DiagResult {
  id: string | null;
  url: string | null;
  score: number;
  grade: string;
  reportMd: string;
}

export default function DiagnoseFormPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DiagResult | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "診断に失敗しました。");
        return;
      }
      setResult(data as DiagResult);
    } catch {
      setError("通信に失敗しました。時間をおいてお試しください。");
    } finally {
      setLoading(false);
    }
  }

  const shareUrl =
    result?.id && typeof window !== "undefined"
      ? `${window.location.origin}/diagnose/${result.id}`
      : null;

  return (
    <div className="lph-diag">
      <div className="lph-diag__hero">
        <h1>LP無料健康診断</h1>
        <p>
          あなたのページのURLを入れるだけ。計測・スマホ対応・行動導線など12項目を今すぐ診断します。登録不要・無料です。
        </p>
      </div>

      <form className="lph-diag__form" onSubmit={onSubmit}>
        <input
          type="text"
          inputMode="url"
          placeholder="https://your-page.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={loading}
          aria-label="診断するURL"
        />
        <button type="submit" disabled={loading || url.trim() === ""}>
          {loading ? "診断中…" : "無料で診断する"}
        </button>
      </form>
      <p className="lph-diag__note">
        ※ 公開されているページのみ診断できます。入力されたURLはページの内容確認のためだけに使用します。
      </p>

      {error && <div className="lph-diag__error">{error}</div>}
      {loading && (
        <div className="lph-diag__loading">ページを取得して診断しています…（数秒かかります）</div>
      )}

      {result && (
        <>
          <main className="lph-diag__report">{renderMarkdown(result.reportMd)}</main>
          {shareUrl && (
            <div className="lph-diag__share">
              この診断結果の共有リンク:
              <br />
              <a href={shareUrl}>{shareUrl}</a>
            </div>
          )}
          <footer>LP秘書 LP健康診断</footer>
        </>
      )}
    </div>
  );
}
