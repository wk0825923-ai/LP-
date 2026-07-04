import Link from "next/link";
import { getSiteSlugs } from "@/lib/sites";

// 運用時にここは公開しない想定(ダッシュボードは作らない方針)。開発用のサイト一覧のみ。
export default function Home() {
  const slugs = getSiteSlugs();
  return (
    <main style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>LP秘書</h1>
      <p>ホスティング中のLP(開発用一覧):</p>
      <ul>
        {slugs.map((slug) => (
          <li key={slug}>
            <Link href={`/${slug}`}>/{slug}</Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
