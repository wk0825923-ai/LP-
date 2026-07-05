// /diagnose(健康診断の入口)はクライアントコンポーネントで metadata を持てないため、
// サーバレイアウトでOGP/タイトルを付与する。個別結果ページ([id])は自前のgenerateMetadataで上書きする。
import type { Metadata } from "next";

const title = "LP無料健康診断";
const description =
  "URLを入れるだけ。計測・スマホ対応・行動導線など12項目を今すぐ無料で診断します。登録不要。";

export const metadata: Metadata = {
  title,
  description,
  openGraph: { title: `${title} — LP秘書`, description, type: "website" },
  twitter: { card: "summary", title: `${title} — LP秘書`, description },
};

export default function DiagnoseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
