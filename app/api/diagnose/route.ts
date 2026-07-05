// LP秘書 スコープ5: LP健康診断トリガー(公開・無料リードマグネット)
// POST /api/diagnose  body: { url: string }
//   認証なし(見込み客が使う入口)。Supabaseがあれば結果を保存し共有用idを返す。
//   未設定時はフォールバックで結果だけ返す(id:null)。
// 注意: 任意URLをサーバから取得するため、SSRF対策はlib/diagnose.ts側(normalizeUrl)で実施。

import { diagnose, DiagnoseInputError } from "@/lib/diagnose";
import { getSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  try {
    const result = await diagnose(body.url ?? "");

    // 保存(任意)。失敗しても診断結果は返す
    let id: string | null = null;
    const supabase = getSupabase();
    if (supabase) {
      const newId = crypto.randomUUID();
      const { error } = await supabase.from("diagnoses").insert({
        id: newId,
        input_url: result.inputUrl,
        final_url: result.finalUrl,
        score: result.score,
        grade: result.grade,
        checks: result.checks,
        report_md: result.reportMd,
        model: result.model,
      });
      if (error) {
        console.error("診断結果の保存に失敗(結果は返す):", error.message);
      } else {
        id = newId;
      }
    }

    return Response.json({
      id,
      url: id ? `/diagnose/${id}` : null,
      score: result.score,
      grade: result.grade,
      headline: result.headline,
      checks: result.checks,
      reportMd: result.reportMd,
      model: result.model,
    });
  } catch (e) {
    if (e instanceof DiagnoseInputError) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : String(e);
    console.error("diagnose failed:", message);
    return Response.json(
      { error: "診断に失敗しました。時間をおいてお試しください。" },
      { status: 500 }
    );
  }
}
