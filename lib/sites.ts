import fs from "node:fs";
import path from "node:path";
import type { SiteContent } from "./types";

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
