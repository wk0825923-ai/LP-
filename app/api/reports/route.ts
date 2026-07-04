// LP秘書 スコープ2: レポート生成トリガー
// POST /api/reports  ヘッダー x-admin-key: $ADMIN_KEY 必須
// body: { site: string, days?: number, send?: boolean, dryRun?: boolean }
//   dryRun: 保存もLINE送信もせず結果だけ返す(動作確認用)
//   send:   生成後にLokuでLINEサマリーを送信(レビューゲート=自分のLINE宛て)

import { getSupabase } from "@/lib/supabase";
import { getSite } from "@/lib/sites";
import { computeStats } from "@/lib/stats";
import { generateReport } from "@/lib/report";
import { sendLineText } from "@/lib/loku";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || req.headers.get("x-admin-key") !== adminKey) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { site?: string; days?: number; send?: boolean; dryRun?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  const site = body.site ?? "";
  const content = getSite(site);
  if (!content) {
    return Response.json({ error: `unknown site: ${site}` }, { status: 404 });
  }
  const days = Math.min(Math.max(Number(body.days) || 7, 1), 90);

  try {
    const stats = await computeStats(site, days);

    // レポートIDは先に確定させ、サマリー本文に詳細ビューURLを埋め込む
    const id = crypto.randomUUID();
    const origin = process.env.PUBLIC_ORIGIN ?? new URL(req.url).origin;
    const reportUrl = body.dryRun ? undefined : `${origin}/reports/${id}`;

    const report = await generateReport(stats, content.name, reportUrl);

    if (!body.dryRun) {
      const supabase = getSupabase();
      if (!supabase) {
        return Response.json({ error: "Supabase未設定" }, { status: 500 });
      }
      const { error } = await supabase.from("reports").insert({
        id,
        site_slug: site,
        period_start: stats.periodStart,
        period_end: stats.periodEnd,
        stats,
        summary_text: report.summaryText,
        report_md: report.reportMd,
        model: report.model,
      });
      if (error) {
        return Response.json(
          { error: `レポート保存失敗: ${error.message}` },
          { status: 500 }
        );
      }
    }

    let sent = false;
    if (body.send && !body.dryRun) {
      await sendLineText(report.summaryText);
      sent = true;
    }

    return Response.json({
      id: body.dryRun ? null : id,
      url: reportUrl ?? null,
      model: report.model,
      sent,
      stats,
      summaryText: report.summaryText,
      reportMd: report.reportMd,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("report generation failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
