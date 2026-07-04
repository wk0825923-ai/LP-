// LP秘書 スコープ3: 計測データ→改善提案(コンテンツへの差分パッチ)
// 安全弁: 変更できるフィールドをホワイトリストで固定(価格・テーマ・構造は絶対に触らせない)。
// 提案の生成はANTHROPIC_API_KEYがあればClaude(Opus — 事業計画のコスト設計どおり)、なければルールベース。

import Anthropic from "@anthropic-ai/sdk";
import type { SiteContent, Section } from "./types";
import type { SiteStats } from "./stats";
import { env } from "./env";

export interface ProposalChange {
  /** 変更対象。例: "hero.headline" / "line.ctaLabel" / "problem.items.0" / "faq.items.1.a" */
  target: string;
  before: string;
  after: string;
  reason: string;
}

export interface Proposal {
  changes: ProposalChange[];
  /** 店主向けの提案説明(LINE/承認ページ用) */
  proposalMd: string;
  model: string;
  /** パッチ適用後のコンテンツ(version繰り上げ済み) */
  nextContent: SiteContent;
  nextVersion: number;
}

// --- 変更禁止リスト(ホワイトリスト方式) ---
// 許可: コピー(文言)のみ。価格・テーマ色・slug・version・URL・構造(セクション増減)は不可。
const TOP_LEVEL_ALLOWED = new Set(["meta.title", "meta.description", "line.ctaLabel"]);
const SECTION_FIELD_ALLOWED = new Set([
  "headline",
  "subheadline",
  "note",
  "heading",
  "closing",
  "body",
]);
// items配下で許可する葉フィールド(pricingのplansは対象外=価格を守る)
const ITEM_FIELD_ALLOWED = new Set(["title", "body", "q", "a"]);

interface ResolvedTarget {
  get: () => string;
  set: (v: string) => void;
}

/** targetパスをホワイトリスト検証しつつ解決する。不正ならnull */
function resolveTarget(content: SiteContent, target: string): ResolvedTarget | null {
  if (TOP_LEVEL_ALLOWED.has(target)) {
    const [obj, field] = target.split(".");
    const holder = content[obj as "meta" | "line"] as unknown as Record<string, string>;
    if (typeof holder?.[field] !== "string") return null;
    return { get: () => holder[field], set: (v) => (holder[field] = v) };
  }

  const parts = target.split(".");
  const section = content.sections.find((s: Section) => s.id === parts[0]);
  if (!section) return null;

  // "sectionId.field"
  if (parts.length === 2 && SECTION_FIELD_ALLOWED.has(parts[1])) {
    const holder = section as unknown as Record<string, unknown>;
    if (typeof holder[parts[1]] !== "string") return null;
    return {
      get: () => holder[parts[1]] as string,
      set: (v) => (holder[parts[1]] = v),
    };
  }

  // "sectionId.items.N" (文字列項目) / "sectionId.items.N.field" (オブジェクト項目)
  if (parts[1] === "items" && /^\d+$/.test(parts[2] ?? "")) {
    const items = (section as unknown as { items?: unknown[] }).items;
    const idx = Number(parts[2]);
    if (!Array.isArray(items) || idx >= items.length) return null;

    if (parts.length === 3 && typeof items[idx] === "string") {
      return { get: () => items[idx] as string, set: (v) => (items[idx] = v) };
    }
    if (parts.length === 4 && ITEM_FIELD_ALLOWED.has(parts[3])) {
      const item = items[idx] as Record<string, unknown>;
      if (typeof item?.[parts[3]] !== "string") return null;
      return {
        get: () => item[parts[3]] as string,
        set: (v) => (item[parts[3]] = v),
      };
    }
  }
  return null;
}

/** パッチをホワイトリスト検証して適用。1件でも不正があればエラー(部分適用しない) */
export function applyChanges(
  content: SiteContent,
  changes: ProposalChange[]
): SiteContent {
  const next = structuredClone(content);
  for (const ch of changes) {
    const resolved = resolveTarget(next, ch.target);
    if (!resolved) {
      throw new Error(`変更禁止または不正なtarget: ${ch.target}`);
    }
    if (typeof ch.after !== "string" || ch.after.trim().length === 0) {
      throw new Error(`afterが空です: ${ch.target}`);
    }
    resolved.set(ch.after);
  }
  next.version = content.version + 1;
  return next;
}

/** ルールベースの提案(LLMなしのフォールバック。CTA文言の定番改善のみ) */
function ruleBasedChanges(content: SiteContent, stats: SiteStats): ProposalChange[] {
  const current = content.line.ctaLabel;
  const candidates = [
    "LINEで空き状況を確認する",
    "LINEで気軽に相談する(無料)",
    "LINEで初回体験を予約する",
  ];
  const after = candidates.find((c) => c !== current) ?? candidates[0];
  return [
    {
      target: "line.ctaLabel",
      before: current,
      after,
      reason: `LINEボタンのタップ率が${stats.ctaRate}%でした。「何が起きるか」が具体的な文言のほうがタップされやすいため、行動の中身が見える表現を提案します。`,
    },
  ];
}

async function llmChanges(
  content: SiteContent,
  stats: SiteStats
): Promise<{ changes: ProposalChange[]; model: string } | null> {
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) return null;
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      system:
        "あなたは小規模店舗のLPを改善する秘書です。計測データを根拠に、LPの文言(コピー)への変更提案を1〜3件作ります。\n" +
        "ルール:\n" +
        "- 変更できるのは文言のみ。価格・色・構造は提案しない\n" +
        "- targetの形式: meta.title / meta.description / line.ctaLabel / {sectionId}.{field}(field=headline,subheadline,note,heading,closing,body) / {sectionId}.items.{N} / {sectionId}.items.{N}.{field}(field=title,body,q,a)。pricingのplans配下は変更不可\n" +
        "- beforeは現在の文言を正確に転記する\n" +
        "- reasonは店主が読む。専門用語なしで、数字を根拠に1〜2文\n" +
        '- 出力はJSONのみ: {"changes":[{"target":"...","before":"...","after":"...","reason":"..."}]}',
      messages: [
        {
          role: "user",
          content:
            `## 計測データ\n${JSON.stringify(stats)}\n\n## 現在のLPコンテンツ\n${JSON.stringify(content)}\n\n` +
            "改善提案をJSONで出力してください。",
        },
      ],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as { changes?: ProposalChange[] };
    if (!Array.isArray(parsed.changes) || parsed.changes.length === 0) return null;
    return { changes: parsed.changes.slice(0, 3), model: "claude-opus-4-8" };
  } catch (e) {
    console.error("LLM提案の生成に失敗(ルールベースにフォールバック):", e);
    return null;
  }
}

export async function generateProposal(
  content: SiteContent,
  stats: SiteStats
): Promise<Proposal> {
  const llm = await llmChanges(content, stats);
  const changes = llm?.changes ?? ruleBasedChanges(content, stats);
  const model = llm?.model ?? "rule-based";

  // 適用(ここでホワイトリスト検証も走る)。LLM出力のbeforeは現物で上書きして正確にする
  for (const ch of changes) {
    const resolved = resolveTarget(content, ch.target);
    if (resolved) ch.before = resolved.get();
  }
  const nextContent = applyChanges(content, changes);

  const proposalMd = [
    `# ${content.name} 改善のご提案`,
    ``,
    `直近の計測をもとに、${changes.length}件の変更をご提案します。`,
    ``,
    ...changes.flatMap((ch, i) => [
      `## 提案${i + 1}`,
      ``,
      `**変更前:** ${ch.before}`,
      ``,
      `**変更後:** ${ch.after}`,
      ``,
      `**理由:** ${ch.reason}`,
      ``,
    ]),
  ].join("\n");

  return {
    changes,
    proposalMd,
    model,
    nextContent,
    nextVersion: nextContent.version,
  };
}
