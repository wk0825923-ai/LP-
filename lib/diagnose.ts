// LP秘書 スコープ5: LP健康診断(リードマグネット)
// 見込み客がURLを入れると、そのLPを取得して技術チェックを行い、即時レポートを返す。
// 診断はルールベースが主(LLMなしでも成立)。任意でHaikuが店主向けの講評を1段落だけ添える。
// 設計思想: 「計測が入っていない」という指摘がそのままLP秘書の営業導線になる。ただし誇張はせず正直に採点する。
// 依存は増やさない(cheerio等は入れず、HTMLは正規表現/文字列で軽く見る)。

import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env";

export type CheckStatus = "good" | "warn" | "bad";

export interface DiagCheck {
  key: string;
  label: string;
  status: CheckStatus;
  /** 満点(全チェックの合計が100になるよう配分) */
  weight: number;
  /** 店主向けの短いコメント */
  detail: string;
}

export interface Diagnosis {
  inputUrl: string;
  finalUrl: string;
  score: number;
  grade: "A" | "B" | "C" | "D";
  checks: DiagCheck[];
  /** 最重要の所見(営業導線)。レポート冒頭に出す */
  headline: string;
  reportMd: string;
  /** 講評の生成元 */
  model: string;
}

/** ユーザーが入力できないエラーはこのクラスで投げ、API側で400として扱う */
export class DiagnoseInputError extends Error {}

// --- 取得(SSRF対策込み) ---------------------------------------------------

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|::1$|\[::1\]|0\.0\.0\.0)/i;
const FETCH_TIMEOUT_MS = 9000;
const MAX_HTML_BYTES = 2_000_000; // 2MB上限(巨大ページで詰まらせない)

interface FetchedPage {
  finalUrl: string;
  html: string;
  bytes: number;
  status: number;
}

function normalizeUrl(raw: string): URL {
  let input = raw.trim();
  if (!input) throw new DiagnoseInputError("URLを入力してください。");
  // スキーム省略はhttpsを補う
  if (!/^https?:\/\//i.test(input)) input = `https://${input}`;
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new DiagnoseInputError("URLの形式が正しくないようです。例: https://example.com");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new DiagnoseInputError("http(s) のURLだけ診断できます。");
  }
  // クラウドメタデータ/内部アドレスは弾く(サーバから任意URLを叩くためのSSRF対策)
  if (PRIVATE_HOST.test(url.hostname) || url.hostname === "169.254.169.254") {
    throw new DiagnoseInputError("そのURLは診断できません。");
  }
  if (!url.hostname.includes(".")) {
    throw new DiagnoseInputError("URLの形式が正しくないようです。例: https://example.com");
  }
  return url;
}

async function fetchPage(url: URL): Promise<FetchedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        // 一般的なブラウザを装う(bot判定で中身が変わるサイト対策)。LP秘書の計測タグは持ち込まない
        "User-Agent":
          "Mozilla/5.0 (compatible; LPhishoDiagnose/1.0; +https://lp-hisho.vercel.app)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const ctype = res.headers.get("content-type") ?? "";
    if (!ctype.includes("html")) {
      throw new DiagnoseInputError("そのURLはWebページ(HTML)ではないようです。");
    }
    const buf = await res.arrayBuffer();
    const bytes = buf.byteLength;
    const html = new TextDecoder("utf-8").decode(buf.slice(0, MAX_HTML_BYTES));
    return { finalUrl: res.url || url.toString(), html, bytes, status: res.status };
  } catch (e) {
    if (e instanceof DiagnoseInputError) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      throw new DiagnoseInputError("ページの読み込みに時間がかかりすぎました。URLをご確認ください。");
    }
    throw new DiagnoseInputError("ページを取得できませんでした。URLが公開されているかご確認ください。");
  } finally {
    clearTimeout(timer);
  }
}

// --- 個別チェック ---------------------------------------------------------

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function extractMeta(html: string, name: string): string {
  // <meta name="description" content="..."> と property= の両対応
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`,
    "i"
  );
  const tag = html.match(re)?.[0];
  if (!tag) return "";
  const c = tag.match(/content=["']([\s\S]*?)["']/i);
  return c ? c[1].replace(/\s+/g, " ").trim() : "";
}

/** 全チェックを実行。weightの合計は100 */
function runChecks(page: FetchedPage, url: URL): DiagCheck[] {
  const html = page.html;
  const lower = html.toLowerCase();
  const checks: DiagCheck[] = [];

  // 1. 計測タグ(最重要・営業導線)
  const hasGa =
    /googletagmanager\.com\/gtag|google-analytics\.com|gtag\s*\(|ga\s*\(\s*['"]create/.test(
      lower
    );
  const hasGtm = /googletagmanager\.com\/gtm\.js|dataLayer/.test(lower);
  const hasPixel = /connect\.facebook\.net|fbq\s*\(/.test(lower);
  const measured = hasGa || hasPixel;
  checks.push({
    key: "measurement",
    label: "計測タグ",
    weight: 20,
    status: measured ? "good" : hasGtm ? "warn" : "bad",
    detail: measured
      ? `アクセス解析タグ(${[hasGa && "Google", hasPixel && "Meta"].filter(Boolean).join("・")})が入っています。ただし、LINE遷移後まで途切れず追えているかは別途確認の余地があります。`
      : hasGtm
        ? "タグ管理ツール(GTM)は入っていますが、解析タグ本体の設定が確認できません。数値が取れていない可能性があります。"
        : "計測タグが見当たりません。今このページを何人が見て、どこで離脱しているかが分からない状態です。改善の前にまず「見える化」が必要です。",
  });

  // 2. LINE/行動導線
  const hasLine = /line\.me|lin\.ee|liff\.line|line:\/\//.test(lower);
  const hasTel = /href=["']tel:/.test(lower);
  const hasForm = /<form[\s>]/.test(lower);
  const hasReserveWord = /予約|ご予約|お申し込み|申込|お問い合わせ|問い合わせ|来店|体験/.test(
    html
  );
  const ctaScore = hasLine ? "good" : hasTel || hasForm || hasReserveWord ? "warn" : "bad";
  checks.push({
    key: "cta",
    label: "行動導線(CTA)",
    weight: 15,
    status: ctaScore,
    detail: hasLine
      ? "LINEへの導線があります。友だち追加後の継続的な接点を作れる、相性の良い設計です。"
      : hasTel || hasForm || hasReserveWord
        ? "電話・フォーム等の導線はありますが、LINEの導線が見当たりません。一度きりで終わらない接点(LINE)への誘導を足すと、後追いができます。"
        : "予約・問い合わせなど「次にすること」が明確な導線が見当たりません。訪問者が行動に移れていない可能性があります。",
  });

  // 3. スマホ対応(viewport)
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  checks.push({
    key: "viewport",
    label: "スマホ対応",
    weight: 12,
    status: hasViewport ? "good" : "bad",
    detail: hasViewport
      ? "スマホ表示の設定(viewport)が入っています。"
      : "スマホ向けの表示設定(viewport)が見当たりません。来店客の多くはスマホで見るため、崩れて見えている恐れがあります。",
  });

  // 4. タイトル
  const title = extractTitle(html);
  const titleLen = [...title].length;
  checks.push({
    key: "title",
    label: "ページタイトル",
    weight: 8,
    status: title === "" ? "bad" : titleLen < 8 || titleLen > 40 ? "warn" : "good",
    detail:
      title === ""
        ? "ページタイトルが設定されていません。検索結果やLINE共有時の見え方に影響します。"
        : titleLen < 8
          ? `タイトルが「${title}」と短めです。店名+特徴+地域を入れると伝わりやすくなります。`
          : titleLen > 40
            ? `タイトルが長め(${titleLen}文字)で、検索結果で途中で切れる可能性があります。`
            : `タイトルは適切な長さです(${titleLen}文字)。`,
  });

  // 5. メタディスクリプション
  const desc = extractMeta(html, "description");
  const descLen = [...desc].length;
  checks.push({
    key: "description",
    label: "説明文(ディスクリプション)",
    weight: 8,
    status: desc === "" ? "bad" : descLen < 30 || descLen > 140 ? "warn" : "good",
    detail:
      desc === ""
        ? "検索結果やSNS共有時に出る説明文が未設定です。クリック率に影響します。"
        : descLen < 30
          ? "説明文が短めです。何のお店で誰向けかを一文で足すと伝わります。"
          : descLen > 140
            ? `説明文が長め(${descLen}文字)で、途中で切れる可能性があります。`
            : "説明文は適切に設定されています。",
  });

  // 6. OGP(SNS/LINE共有時の見え方)
  const ogImage = extractMeta(html, "og:image");
  const ogTitle = extractMeta(html, "og:title");
  const ogCount = (ogImage ? 1 : 0) + (ogTitle ? 1 : 0);
  checks.push({
    key: "ogp",
    label: "SNS共有の見え方(OGP)",
    weight: 8,
    status: ogCount === 2 ? "good" : ogCount === 1 ? "warn" : "bad",
    detail:
      ogCount === 2
        ? "LINEやSNSで共有したときに、画像とタイトルがきれいに表示されます。"
        : ogCount === 1
          ? "共有時の設定が一部だけです。画像とタイトルを両方入れると、シェアされたときの見栄えが上がります。"
          : "SNS共有時の画像・タイトル設定(OGP)が見当たりません。LINEで送られても素っ気ない表示になります。",
  });

  // 7. 見出し(h1)
  const h1Count = (lower.match(/<h1[\s>]/g) || []).length;
  checks.push({
    key: "h1",
    label: "見出し構成(H1)",
    weight: 7,
    status: h1Count === 1 ? "good" : h1Count === 0 ? "bad" : "warn",
    detail:
      h1Count === 1
        ? "ページの主見出しが1つに整理されています。"
        : h1Count === 0
          ? "ページの主見出し(H1)が見当たりません。一番伝えたい一言を大きな見出しにしましょう。"
          : `主見出し(H1)が${h1Count}個あります。1つに絞ると訴求がぶれません。`,
  });

  // 8. HTTPS
  const isHttps = new URL(page.finalUrl).protocol === "https:" && url.protocol !== "http:";
  const httpsOk = new URL(page.finalUrl).protocol === "https:";
  checks.push({
    key: "https",
    label: "常時SSL(HTTPS)",
    weight: 7,
    status: httpsOk ? "good" : "bad",
    detail: httpsOk
      ? "通信が暗号化(HTTPS)されています。"
      : "HTTPSになっていません。ブラウザで「保護されていない通信」と警告が出て、信頼を損ないます。",
  });
  void isHttps;

  // 9. 言語設定
  const hasLang = /<html[^>]+lang=/i.test(html);
  checks.push({
    key: "lang",
    label: "言語設定",
    weight: 3,
    status: hasLang ? "good" : "warn",
    detail: hasLang
      ? "ページの言語設定(lang)が入っています。"
      : "ページの言語設定(lang=\"ja\")が未設定です。細かい点ですが入れておくと丁寧です。",
  });

  // 10. ファビコン
  const hasFavicon = /<link[^>]+rel=["'][^"']*icon/i.test(html);
  checks.push({
    key: "favicon",
    label: "ファビコン",
    weight: 2,
    status: hasFavicon ? "good" : "warn",
    detail: hasFavicon
      ? "ブラウザのタブに出るアイコン(ファビコン)が設定されています。"
      : "タブに出るアイコン(ファビコン)が未設定です。ブックマーク時の識別に関わります。",
  });

  // 11. 画像のalt(代替テキスト)
  const imgCount = (lower.match(/<img[\s>]/g) || []).length;
  const imgWithAlt = (lower.match(/<img[^>]+alt=/g) || []).length;
  const altRate = imgCount === 0 ? 1 : imgWithAlt / imgCount;
  checks.push({
    key: "img_alt",
    label: "画像の代替テキスト",
    weight: 5,
    status: imgCount === 0 ? "warn" : altRate >= 0.8 ? "good" : altRate >= 0.4 ? "warn" : "bad",
    detail:
      imgCount === 0
        ? "画像がほとんど検出されませんでした。写真は来店イメージに直結するので、活用の余地があります。"
        : altRate >= 0.8
          ? "画像に説明文(alt)がおおむね設定されています。"
          : `画像${imgCount}枚のうち説明文(alt)付きは${imgWithAlt}枚です。検索と読み上げ対応のため補うと良いです。`,
  });

  // 12. ページの重さ(HTMLサイズの目安)
  const kb = Math.round(page.bytes / 1024);
  checks.push({
    key: "weight",
    label: "ページの軽さ(目安)",
    weight: 5,
    status: page.bytes < 150_000 ? "good" : page.bytes < 500_000 ? "warn" : "bad",
    detail:
      page.bytes < 150_000
        ? `HTMLは${kb}KBと軽めです(表示が速い傾向)。`
        : page.bytes < 500_000
          ? `HTMLが${kb}KBとやや重めです。画像の圧縮や不要なコードの整理で速くなります。`
          : `HTMLが${kb}KBと重く、表示に時間がかかっている可能性があります。スマホの離脱要因になります。`,
  });

  return checks;
}

const STATUS_SCORE: Record<CheckStatus, number> = { good: 1, warn: 0.5, bad: 0 };
const STATUS_MARK: Record<CheckStatus, string> = { good: "○", warn: "△", bad: "×" };

function scoreOf(checks: DiagCheck[]): number {
  const earned = checks.reduce((a, c) => a + c.weight * STATUS_SCORE[c.status], 0);
  const total = checks.reduce((a, c) => a + c.weight, 0);
  return Math.round((earned / total) * 100);
}

function gradeOf(score: number): Diagnosis["grade"] {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

/** 最重要の所見。計測が弱いときはそこを最優先(=LP秘書の入口) */
function headlineOf(checks: DiagCheck[]): string {
  const measurement = checks.find((c) => c.key === "measurement");
  if (measurement && measurement.status !== "good") return measurement.detail;
  const worst = checks
    .filter((c) => c.status === "bad")
    .sort((a, b) => b.weight - a.weight)[0];
  if (worst) return worst.detail;
  const warn = checks
    .filter((c) => c.status === "warn")
    .sort((a, b) => b.weight - a.weight)[0];
  if (warn) return warn.detail;
  return "大きな問題は見つかりませんでした。あとは実際の数字(誰が見て、どこで離脱しているか)を見ながら磨き込む段階です。";
}

// --- 講評(任意でHaiku、なければルールベース) -----------------------------

async function llmReview(
  finalUrl: string,
  score: number,
  checks: DiagCheck[]
): Promise<{ text: string; model: string } | null> {
  const apiKey = env("ANTHROPIC_API_KEY");
  if (!apiKey) return null;
  try {
    const client = new Anthropic({ apiKey });
    const payload = checks.map((c) => ({
      項目: c.label,
      判定: c.status,
      コメント: c.detail,
    }));
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system:
        "あなたは小規模店舗のLP(ランディングページ)を担当する秘書です。" +
        "診断結果をもとに、店主向けの総評を日本語で2〜3文で書きます。" +
        "専門用語を避け、良い点を1つ認めた上で、最優先で直すべき1点を具体的に示してください。" +
        "煽らず、事実に即して、前向きな一歩を促す口調で。出力は総評の本文のみ。",
      messages: [
        {
          role: "user",
          content: `対象URL: ${finalUrl}\n総合スコア: ${score}/100\n診断結果:\n${JSON.stringify(payload, null, 2)}`,
        },
      ],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    return text ? { text, model: "claude-haiku-4-5-20251001" } : null;
  } catch (e) {
    console.error("LLM講評の生成に失敗(ルールベースにフォールバック):", e);
    return null;
  }
}

function ruleBasedReview(score: number, checks: DiagCheck[], headline: string): string {
  const good = checks.filter((c) => c.status === "good").length;
  const bad = checks.filter((c) => c.status === "bad").length;
  const grade = gradeOf(score);
  const intro =
    grade === "A"
      ? "全体的によく整ったLPです。"
      : grade === "B"
        ? "土台はできています。あと少しの改善で伸びしろがあります。"
        : grade === "C"
          ? "いくつか目立つ改善点があります。"
          : "基本的な部分から見直す余地が大きい状態です。";
  return `${intro}${good}項目が良好、${bad}項目に課題が見つかりました。最優先は次の点です — ${headline}`;
}

// --- レポート(Markdown) ---------------------------------------------------

function buildReportMd(d: Omit<Diagnosis, "reportMd">, review: string): string {
  const lines: string[] = [
    `# LP健康診断レポート`,
    ``,
    `対象URL: ${d.finalUrl}`,
    ``,
    `## 総合スコア`,
    ``,
    `| 総合スコア | 等級 |`,
    `|---|---|`,
    `| ${d.score} / 100 | ${d.grade} |`,
    ``,
    `## 総評`,
    ``,
    review,
    ``,
    `## 診断結果`,
    ``,
    `| 項目 | 判定 | コメント |`,
    `|---|---|---|`,
    ...d.checks.map((c) => `| ${c.label} | ${STATUS_MARK[c.status]} | ${c.detail} |`),
    ``,
    `## 次の一歩`,
    ``,
    `診断は「今の状態」を写したものです。実際にどれだけの人が見て、どこで離脱し、LINEまで進んでいるかは、計測を入れて初めて分かります。LP秘書は、計測からレポート・改善提案・公開までをLINEの中で完結させる「あなた専用のLP秘書」です。`,
  ];
  return lines.join("\n");
}

// --- エントリポイント -------------------------------------------------------

export async function diagnose(rawUrl: string): Promise<Diagnosis> {
  const url = normalizeUrl(rawUrl);
  const page = await fetchPage(url);
  const checks = runChecks(page, url);
  const score = scoreOf(checks);
  const grade = gradeOf(score);
  const headline = headlineOf(checks);

  const llm = await llmReview(page.finalUrl, score, checks);
  const review = llm?.text ?? ruleBasedReview(score, checks, headline);
  const model = llm?.model ?? "rule-based";

  const base: Omit<Diagnosis, "reportMd"> = {
    inputUrl: url.toString(),
    finalUrl: page.finalUrl,
    score,
    grade,
    checks,
    headline,
    model,
  };
  return { ...base, reportMd: buildReportMd(base, review) };
}
