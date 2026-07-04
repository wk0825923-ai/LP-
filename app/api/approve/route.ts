// LP秘書 スコープ3: 提案の承認/却下
// POST /api/approve (フォーム送信)  body: id=<draft uuid>&action=approve|reject
// uuidを知っている人=LINEで提案を受け取った本人、が認可の前提(レポートと同じトークン方式)。
// 承認: site_versionsをpublishedにし、sites.active_versionを進める → LPは次のリクエストから新版を配信

import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const form = await req.formData();
  const id = String(form.get("id") ?? "");
  const action = String(form.get("action") ?? "");

  if (!/^[0-9a-f-]{36}$/.test(id) || !["approve", "reject"].includes(action)) {
    return new Response("bad request", { status: 400 });
  }

  const supabase = getSupabase();
  if (!supabase) return new Response("Supabase未設定", { status: 500 });

  const { data: draft, error } = await supabase
    .from("site_versions")
    .select("id, site_slug, version, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !draft) return new Response("not found", { status: 404 });

  // 二重タップ・確定済みは何もせず結果ページへ
  if (draft.status === "draft") {
    if (action === "approve") {
      const { error: e1 } = await supabase
        .from("site_versions")
        .update({ status: "published", decided_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "draft");
      if (e1) return new Response(`更新失敗: ${e1.message}`, { status: 500 });

      const { error: e2 } = await supabase
        .from("sites")
        .update({ active_version: draft.version })
        .eq("slug", draft.site_slug);
      if (e2) return new Response(`公開失敗: ${e2.message}`, { status: 500 });
    } else {
      await supabase
        .from("site_versions")
        .update({ status: "rejected", decided_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "draft");
    }
  }

  redirect(`/approve/${id}`);
}
