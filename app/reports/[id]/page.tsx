// LP秘書 スコープ2: レポートWeb詳細ビュー
// URLのuuidが実質のアクセストークン(推測不能)。店主はLINEのリンクから開くだけ。

import { notFound } from "next/navigation";
import { Noto_Sans_JP } from "next/font/google";
import { getSupabase } from "@/lib/supabase";
import "./report.css";

const notoSansJp = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

export const dynamic = "force-dynamic";

interface ReportRow {
  id: string;
  site_slug: string;
  report_md: string;
  created_at: string;
}

// 依存を増やさない最小Markdownレンダラー(h1/h2/箇条書き/表/段落のみ)
function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("# ")) {
      out.push(<h1 key={key++}>{line.slice(2)}</h1>);
      i++;
    } else if (line.startsWith("## ")) {
      out.push(<h2 key={key++}>{line.slice(3)}</h2>);
      i++;
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].slice(2));
        i++;
      }
      out.push(
        <ul key={key++}>
          {items.map((item, j) => (
            <li key={j}>{item}</li>
          ))}
        </ul>
      );
    } else if (line.startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        const cells = lines[i]
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim());
        // 区切り行(|---|---|)はスキップ
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      out.push(
        <table key={key++}>
          <thead>
            <tr>
              {head.map((c, j) => (
                <th key={j}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, j) => (
              <tr key={j}>
                {row.map((c, k) => (
                  <td key={k}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    } else if (line.trim() === "") {
      i++;
    } else {
      out.push(<p key={key++}>{line}</p>);
      i++;
    }
  }
  return out;
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const supabase = getSupabase();
  if (!supabase) notFound();

  const { data, error } = await supabase
    .from("reports")
    .select("id, site_slug, report_md, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) notFound();

  const report = data as ReportRow;

  return (
    <div className={`lph-report ${notoSansJp.className}`}>
      <main>{renderMarkdown(report.report_md)}</main>
      <footer>
        作成: {new Date(report.created_at).toLocaleDateString("ja-JP")} — LP秘書
      </footer>
    </div>
  );
}
