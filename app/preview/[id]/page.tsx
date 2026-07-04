// LP秘書: 提案コンテンツのプレビュー
// 承認前に「変更後のページの実物」を見るためのルート。uuidを知っている人だけが開ける。
// 計測タグは載せない(プレビュー閲覧を本番データに混ぜない)。検索エンジンにも載せない。

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Noto_Sans_JP } from "next/font/google";
import { getSupabase } from "@/lib/supabase";
import type { SiteContent } from "@/lib/types";
import { SectionRenderer, StickyCta } from "@/components/sections";
import "../../[site]/lp.css";

const notoSansJp = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function PreviewPage({
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
    .select("content, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) notFound();

  const content = data.content as SiteContent;
  const banner =
    data.status === "draft"
      ? "プレビュー — これは承認前の変更案です(まだ公開されていません)"
      : data.status === "published"
        ? "プレビュー — この内容は公開済みです"
        : "プレビュー — この変更案は見送りになりました";

  return (
    <div
      className={`lph ${notoSansJp.className}`}
      style={
        {
          "--accent": content.theme.accent,
          "--bg": content.theme.background,
        } as React.CSSProperties
      }
    >
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "#1a1a1a",
          color: "#fff",
          textAlign: "center",
          padding: "8px 12px",
          fontSize: "0.8rem",
          fontWeight: 700,
        }}
      >
        {banner}
      </div>
      {content.sections.map((section) => (
        <SectionRenderer key={section.id} section={section} line={content.line} />
      ))}
      <StickyCta line={content.line} />
    </div>
  );
}
