import fs from "node:fs";
import path from "node:path";

// content/lp-playbook.md（プロのLP制作手順書）を実行時に読み込み、
// AIの所見・改善提案・診断講評の system プロンプトに「判断基準」として注入する。
// content/ は sites.ts と同様に配信物として読める。読めない場合は空文字にフォールバックし、
// 従来どおり(手順書なし)で動作する＝本番を壊さない。
let cached: string | null = null;

export function getPlaybook(): string {
  if (cached !== null) return cached;
  try {
    const file = path.join(process.cwd(), "content", "lp-playbook.md");
    cached = fs.readFileSync(file, "utf-8");
  } catch {
    cached = "";
  }
  return cached;
}

/** system プロンプトの先頭に付ける手順書ブロック（無ければ空文字）。 */
export function playbookPreamble(): string {
  const pb = getPlaybook();
  if (!pb) return "";
  return `# 参考: LP制作 手順書（あなたの判断基準。これに沿って考える）\n${pb}\n\n---\n\n`;
}
