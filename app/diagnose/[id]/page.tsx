// LP秘書 スコープ5: LP健康診断の共有ビュー
// 保存済み診断の閲覧・共有用。uuidが推測不能なアクセストークンを兼ねる(導入事例がシェアされる設計)。

import { notFound } from "next/navigation";
import { Noto_Sans_JP } from "next/font/google";
import { getSupabase } from "@/lib/supabase";
import { renderMarkdown } from "@/lib/markdown";
import "../diagnose.css";

const notoSansJp = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

export const dynamic = "force-dynamic";

interface DiagnosisRow {
  id: string;
  report_md: string;
  created_at: string;
}

export default async function DiagnosisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const supabase = getSupabase();
  if (!supabase) notFound();

  const { data, error } = await supabase
    .from("diagnoses")
    .select("id, report_md, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) notFound();

  const row = data as DiagnosisRow;

  return (
    <div className={`lph-diag ${notoSansJp.className}`}>
      <main className="lph-diag__report">{renderMarkdown(row.report_md)}</main>
      <footer>
        診断日: {new Date(row.created_at).toLocaleDateString("ja-JP")} — LP秘書 LP健康診断
      </footer>
    </div>
  );
}
