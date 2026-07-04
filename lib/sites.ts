import fs from "node:fs";
import path from "node:path";
import type { SiteContent } from "./types";
import { getSupabase } from "./supabase";

const SITES_DIR = path.join(process.cwd(), "content", "sites");

export function getSiteSlugs(): string[] {
  return fs
    .readdirSync(SITES_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

export function getSite(slug: string): SiteContent | null {
  // slugはパス片として使うため英数とハイフンのみ許可
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const file = path.join(SITES_DIR, `${slug}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8")) as SiteContent;
}

/**
 * 実際に配信するコンテンツを返す(スコープ3)。
 * sites.active_version が進んでいればDBのpublished版、そうでなければファイル版。
 * DB未設定・障害時は必ずファイル版にフォールバックする(LPを落とさない)。
 */
export async function getServedContent(slug: string): Promise<SiteContent | null> {
  const fileContent = getSite(slug);
  if (!fileContent) return null;

  const supabase = getSupabase();
  if (!supabase) return fileContent;

  try {
    const { data: site } = await supabase
      .from("sites")
      .select("active_version")
      .eq("slug", slug)
      .maybeSingle();
    if (!site || site.active_version <= fileContent.version) return fileContent;

    const { data: ver } = await supabase
      .from("site_versions")
      .select("content")
      .eq("site_slug", slug)
      .eq("version", site.active_version)
      .eq("status", "published")
      .maybeSingle();
    return ver ? (ver.content as SiteContent) : fileContent;
  } catch {
    return fileContent;
  }
}
