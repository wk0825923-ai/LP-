// LP秘書 スコープ2: 集計値 → 所見付きレポート(LINEサマリー + Web詳細Markdown)
// 所見はANTHROPIC_API_KEYがあればClaude(Sonnet — 事業計画のコスト設計どおり)、なければルールベース。

import Anthropic from "@anthropic-ai/sdk";
import type { SiteStats } from "./stats";
import { env } from "./env";

export interface GeneratedReport {
  summaryText: string;
  reportMd: string;
  model: string;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtDwell(ms: number): string {
  return ms >= 1000 ? `${Math.round(ms / 100) / 10}秒` : `${ms}ms`;
}

/** ルールベースの所見(LLMなしでも成立する安全なフォールバック) */
function ruleBasedInsights(s: SiteStats): string[] {
  const out: string[] = [];
  if (s.sessions === 0) {
    return ["この期間の訪問はまだありません。広告リンクやQRの掲出状況を確認しましょう。"];
  }
  if (s.ctaRate >= 10) {
    out.push(`LINEボタンのタップ率は${s.ctaRate}%と好調です。流入を増やすことが次の一手になります。`);
  } else if (s.ctaRate >= 3) {
    out.push(`LINEボタンのタップ率は${s.ctaRate}%で平均的な水準です。`);
  } else {
    out.push(`LINEボタンのタップ率が${s.ctaRate}%と低めです。ボタンの文言や位置の見直し余地があります。`);
  }
  if (s.scrollReach.p50 < 50) {
    out.push(`ページ半分まで読む人が${s.scrollReach.p50}%にとどまっています。冒頭(ファーストビュー)で興味を引けていない可能性があります。`);
  }
  if (s.scrollReach.p100 >= 30) {
    out.push(`${s.scrollReach.p100}%の人が最後まで読んでいます。関心の高い訪問者が多いページです。`);
  }
  const weakest = [...s.sections].sort((a, b) => a.viewRate - b.viewRate)[0];
  if (weakest && weakest.viewRate < 40) {
    out.push(`「${weakest.id}」セクションまで到達する人が${weakest.viewRate}%と少なめです。その手前で離脱が起きています。`);
  }
  const topSource = s.sources[0];
  if (topSource && s.sources.length > 1) {
    out.push(`流入は「${topSource.name}」が最多(${topSource.sessions}セッション)です。`);
  }
  return out;
}

async function llmInsights(s: SiteStats): Promise<string[] | null> {
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) return null;
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system:
        "あなたは小規模店舗のLP(ランディングページ)を担当する秘書です。計測データから、店主向けの所見を日本語で3〜5個作ります。" +
        "各所見は1〜2文、専門用語(CVR・ヒートマップ等)を使わず、数字を根拠に、次に何をすべきかが分かる表現にしてください。" +
        "出力は所見のみを1行1個のプレーンテキストで。番号や記号は付けないでください。",
      messages: [
        {
          role: "user",
          content: `以下はLPの計測データ(JSON)です。所見を作成してください。\n${JSON.stringify(s)}`,
        },
      ],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    return lines.length > 0 ? lines : null;
  } catch (e) {
    console.error("LLM所見の生成に失敗(ルールベースにフォールバック):", e);
    return null;
  }
}

export async function generateReport(
  s: SiteStats,
  siteName: string,
  reportUrl?: string
): Promise<GeneratedReport> {
  const llm = await llmInsights(s);
  const insights = llm ?? ruleBasedInsights(s);
  const model = llm ? "claude-sonnet-4-6" : "rule-based";
  const period = `${fmtDate(s.periodStart)}〜${fmtDate(s.periodEnd)}`;

  // --- LINEサマリー(プレーンテキスト・15行以内目安) ---
  const summaryLines = [
    `📋 ${siteName} LPレポート(${period})`,
    ``,
    `訪問: ${s.sessions}回(${s.visitors}人)`,
    `LINEボタンタップ: ${s.ctaClicks}回(訪問の${s.ctaRate}%)`,
    `最後まで読んだ人: ${s.scrollReach.p100}%`,
    ``,
    `【所見】`,
    ...insights.map((i) => `・${i}`),
  ];
  if (reportUrl) {
    summaryLines.push(``, `詳しいレポートはこちら:`, reportUrl);
  }

  // --- Web詳細ビュー(Markdown) ---
  const md = [
    `# ${siteName} LPレポート`,
    ``,
    `対象期間: ${period}(${s.days}日間)`,
    ``,
    `## サマリー`,
    ``,
    `| 指標 | 値 |`,
    `|---|---|`,
    `| 訪問(セッション) | ${s.sessions} |`,
    `| 訪問者数 | ${s.visitors} |`,
    `| ページ表示 | ${s.pageviews} |`,
    `| LINEボタンタップ | ${s.ctaClicks}回 / ${s.ctaSessions}セッション(${s.ctaRate}%) |`,
    ``,
    `## 所見`,
    ``,
    ...insights.map((i) => `- ${i}`),
    ``,
    `## どこまで読まれたか`,
    ``,
    `| 位置 | 到達した訪問の割合 |`,
    `|---|---|`,
    `| 冒頭1/4 | ${s.scrollReach.p25}% |`,
    `| 半分 | ${s.scrollReach.p50}% |`,
    `| 3/4 | ${s.scrollReach.p75}% |`,
    `| 最後まで | ${s.scrollReach.p100}% |`,
    ``,
    `## セクション別`,
    ``,
    `| セクション | 見た訪問の割合 | 平均滞在 |`,
    `|---|---|---|`,
    ...s.sections.map(
      (sec) => `| ${sec.id} | ${sec.viewRate}% | ${fmtDwell(sec.avgDwellMs)} |`
    ),
    ``,
    `## 流入元`,
    ``,
    `| 流入元 | 訪問 |`,
    `|---|---|`,
    ...s.sources.map((src) => `| ${src.name} | ${src.sessions} |`),
  ];

  return {
    summaryText: summaryLines.join("\n"),
    reportMd: md.join("\n"),
    model,
  };
}
