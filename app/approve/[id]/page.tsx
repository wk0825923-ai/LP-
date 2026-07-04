// LP秘書 スコープ3: 提案の承認ページ
// LINEのリンクから開く。変更前後の比較を見て、承認(公開) or 見送りを1タップで選ぶ。

import { notFound } from "next/navigation";
import { Noto_Sans_JP } from "next/font/google";
import { getSupabase } from "@/lib/supabase";
import type { ProposalChange } from "@/lib/proposal";
import "./approve.css";

const notoSansJp = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

export const dynamic = "force-dynamic";

interface DraftRow {
  id: string;
  site_slug: string;
  version: number;
  changes: ProposalChange[] | null;
  status: string;
  created_at: string;
}

export default async function ApprovePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const supabase = getSupabase();
  if (!supabase) notFound();

  const { data, error } = await supabase
    .from("site_versions")
    .select("id, site_slug, version, changes, status, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) notFound();

  const draft = data as DraftRow;
  const changes = draft.changes ?? [];

  return (
    <div className={`lph-approve ${notoSansJp.className}`}>
      <main>
        <h1>改善のご提案</h1>
        <p className="meta">
          対象: /{draft.site_slug} — 提案 {changes.length}件
        </p>

        {changes.map((ch, i) => (
          <section key={i} className="change">
            <h2>提案{i + 1}</h2>
            <div className="diff">
              <div className="before">
                <span className="label">変更前</span>
                <p>{ch.before}</p>
              </div>
              <div className="after">
                <span className="label">変更後</span>
                <p>{ch.after}</p>
              </div>
            </div>
            <p className="reason">{ch.reason}</p>
          </section>
        ))}

        {draft.status === "draft" ? (
          <div className="actions">
            <form method="post" action="/api/approve">
              <input type="hidden" name="id" value={draft.id} />
              <input type="hidden" name="action" value="approve" />
              <button type="submit" className="approve-btn">
                承認して公開する
              </button>
            </form>
            <form method="post" action="/api/approve">
              <input type="hidden" name="id" value={draft.id} />
              <input type="hidden" name="action" value="reject" />
              <button type="submit" className="reject-btn">
                今回は見送る
              </button>
            </form>
          </div>
        ) : draft.status === "published" ? (
          <div className="decided published">
            ✅ この提案は公開済みです。LPに反映されています。
          </div>
        ) : (
          <div className="decided rejected">この提案は見送りになりました。</div>
        )}
      </main>
      <footer>LP秘書</footer>
    </div>
  );
}
