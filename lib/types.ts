// LP秘書 — LPコンテンツの構造化スキーマ
// LPはHTMLではなくこのJSON構造で保持し、AIは差分パッチとしてこの構造だけを編集する(HTML直編集させない=事故防止)。
// 各セクションの `id` は計測イベント(section_view / section_dwell)とAIパッチのターゲットキーを兼ねる。

export interface SiteContent {
  slug: string;
  name: string;
  /** コンテンツバージョン。変更(デプロイ)ごとにインクリメントし、計測イベントに記録して前後比較を成立させる */
  version: number;
  meta: {
    title: string;
    description: string;
  };
  theme: {
    /** アクセントカラー(CTA等)。数字は素のゴシック太字、装飾フォント禁止 */
    accent: string;
    background: string;
  };
  line: {
    /** Lokuで発行した経路リンク(l.oku-ai.co.jp/r/xxx)。UTMは顧客に見せない */
    ctaHref: string;
    ctaLabel: string;
  };
  sections: Section[];
}

export type Section =
  | HeroSection
  | ProblemSection
  | BenefitsSection
  | PricingSection
  | FaqSection
  | CtaSection;

interface SectionBase {
  /** 計測キー兼AIパッチターゲット。例: "hero", "pricing" */
  id: string;
}

export interface HeroSection extends SectionBase {
  type: "hero";
  headline: string;
  subheadline: string;
  note?: string;
}

export interface ProblemSection extends SectionBase {
  type: "problem";
  heading: string;
  items: string[];
  closing?: string;
}

export interface BenefitsSection extends SectionBase {
  type: "benefits";
  heading: string;
  items: { title: string; body: string }[];
}

export interface PricingSection extends SectionBase {
  type: "pricing";
  heading: string;
  plans: {
    name: string;
    /** 「1回あたり」単価アンカリング用 */
    perSession?: string;
    price: string;
    note?: string;
    featured?: boolean;
  }[];
  /** リスク除去表現(入会金0円など) */
  riskReversal?: string[];
}

export interface FaqSection extends SectionBase {
  type: "faq";
  heading: string;
  items: { q: string; a: string }[];
}

export interface CtaSection extends SectionBase {
  type: "cta";
  heading: string;
  body?: string;
}

/** 計測スクリプト(t.js)が /api/track にPOSTするペイロード */
export interface TrackPayload {
  site: string;
  /** lp_version */
  v?: string;
  /** visitor id (localStorage) */
  vid: string;
  /** session id (sessionStorage) */
  sid: string;
  url: string;
  ref: string;
  /** クエリパラメータ(utm等) */
  q?: Record<string, string>;
  events: TrackEvent[];
}

export interface TrackEvent {
  /** pageview | scroll | section_view | section_dwell | cta_click */
  t: string;
  /** section id */
  s?: string;
  /** scroll% or dwell ms */
  val?: number;
  m?: Record<string, unknown>;
  ts: number;
}
