import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Script from "next/script";
import { Noto_Sans_JP } from "next/font/google";
import { getServedContent } from "@/lib/sites";
import { SectionRenderer, StickyCta } from "@/components/sections";
import "./lp.css";

const notoSansJp = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

// 承認された改善を即反映するため、リクエスト毎にDBの公開バージョンを解決する(スコープ3)
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ site: string }>;
}): Promise<Metadata> {
  const { site } = await params;
  const content = await getServedContent(site);
  if (!content) return {};
  return {
    title: content.meta.title,
    description: content.meta.description,
  };
}

export default async function LpPage({
  params,
}: {
  params: Promise<{ site: string }>;
}) {
  const { site } = await params;
  const content = await getServedContent(site);
  if (!content) notFound();

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
      {content.sections.map((section) => (
        <SectionRenderer key={section.id} section={section} line={content.line} />
      ))}
      <StickyCta line={content.line} />
      <Script
        src="/t.js"
        strategy="afterInteractive"
        data-site={content.slug}
        data-version={String(content.version)}
      />
    </div>
  );
}
