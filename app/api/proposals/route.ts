// LP秘書 スコープ3: 改善提案の生成トリガー
// POST /api/proposals  ヘッダー x-admin-key: $ADMIN_KEY 必須
// body: { site: string, days?: number, send?: boolean, dryRun?: boolean }
// 生成した提案はsite_versionsにdraftで保存し、send:trueならLINEで承認リンクを送る。

import { getSupabase } from "@/lib/supabase";
import { getServedContent } from "@/lib/sites";
import { computeStats } from "@/lib/stats";
import { generateProposal } from "@/lib/proposal";
import { sendLineText } from "@/lib/loku";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const adminKey = env("ADMIN_KEY");
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
  const content = await getServedContent(site);
  if (!content) {
    return Response.json({ error: `unknown site: ${site}` }, { status: 404 });
  }
  const days = Math.min(Math.max(Number(body.days) || 7, 1), 90);

  try {
    const stats = await computeStats(site, days);
    const proposal = await generateProposal(content, stats);

    if (body.dryRun) {
      return Response.json({
        id: null,
        model: proposal.model,
        nextVersion: proposal.nextVersion,
        changes: proposal.changes,
        proposalMd: proposal.proposalMd,
      });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return Response.json({ error: "Supabase未設定" }, { status: 500 });
    }

    // 却下済みドラフトが同じバージョン番号を占有している場合があるため、
    // 既存の最大バージョン+1まで繰り上げる(unique制約違反の回避)
    const { data: maxRow } = await supabase
      .from("site_versions")
      .select("version")
      .eq("site_slug", site)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = Math.max(proposal.nextVersion, (maxRow?.version ?? 0) + 1);
    proposal.nextContent.version = nextVersion;

    const id = crypto.randomUUID();
    const { error } = await supabase.from("site_versions").insert({
      id,
      site_slug: site,
      version: nextVersion,
      content: proposal.nextContent,
      proposal_md: proposal.proposalMd,
      changes: proposal.changes,
      status: "draft",
    });
    if (error) {
      return Response.json(
        { error: `提案の保存失敗: ${error.message}` },
        { status: 500 }
      );
    }

    const origin = env("PUBLIC_ORIGIN") ?? new URL(req.url).origin;
    const approveUrl = `${origin}/approve/${id}`;

    let sent = false;
    if (body.send) {
      const first = proposal.changes[0];
      const lines = [
        `💡 ${content.name} 改善のご提案(${proposal.changes.length}件)`,
        ``,
        `例: 「${first.before}」`,
        `　→「${first.after}」`,
        ``,
        first.reason,
        ``,
        `内容の確認と承認はこちら(1タップで公開されます):`,
        approveUrl,
      ];
      await sendLineText(lines.join("\n"));
      sent = true;
    }

    return Response.json({
      id,
      url: approveUrl,
      model: proposal.model,
      nextVersion: proposal.nextVersion,
      changes: proposal.changes,
      sent,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("proposal generation failed:", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
