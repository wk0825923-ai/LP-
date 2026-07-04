// LP秘書 スコープ2: eventsテーブル → 集計値
// レポート生成とLINEサマリーの入力になる。集計はサーバ側TSで行う(イベント量が小さいMVP前提)。

import { getSupabase } from "./supabase";

export interface SectionStats {
  id: string;
  /** セクションを見たセッション数 */
  viewSessions: number;
  /** viewSessions / sessions */
  viewRate: number;
  /** 平均滞在ms(section_dwellの合計をセッション単位で平均) */
  avgDwellMs: number;
}

export interface SiteStats {
  site: string;
  periodStart: string;
  periodEnd: string;
  days: number;
  pageviews: number;
  sessions: number;
  visitors: number;
  ctaClicks: number;
  /** CTAをタップしたセッション数 */
  ctaSessions: number;
  /** ctaSessions / sessions */
  ctaRate: number;
  /** スクロール到達率(そのマークに達したセッション割合) */
  scrollReach: { p25: number; p50: number; p75: number; p100: number };
  sections: SectionStats[];
  /** 流入元(referrerホスト or utm_source)別セッション数 */
  sources: { name: string; sessions: number }[];
  /** LPバージョン別pageview(前後比較用) */
  versions: { version: number | null; pageviews: number }[];
}

interface EventRow {
  session_id: string | null;
  visitor_id: string | null;
  type: string;
  section: string | null;
  value: number | null;
  referrer: string | null;
  query: Record<string, string> | null;
  lp_version: number | null;
}

const PAGE_SIZE = 1000;

async function fetchEvents(
  site: string,
  from: Date,
  to: Date
): Promise<EventRow[]> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase未設定");

  const rows: EventRow[] = [];
  for (let page = 0; page < 50; page++) {
    const { data, error } = await supabase
      .from("events")
      .select("session_id, visitor_id, type, section, value, referrer, query, lp_version")
      .eq("site_slug", site)
      .gte("created_at", from.toISOString())
      .lt("created_at", to.toISOString())
      .order("id", { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw new Error(`events取得失敗: ${error.message}`);
    rows.push(...(data as EventRow[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

function ratio(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0; // %表記・小数1桁
}

export async function computeStats(site: string, days: number): Promise<SiteStats> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const events = await fetchEvents(site, from, to);

  const sessions = new Set<string>();
  const visitors = new Set<string>();
  let pageviews = 0;
  let ctaClicks = 0;
  const ctaSessions = new Set<string>();
  const scrollSessions: Record<number, Set<string>> = {
    25: new Set(),
    50: new Set(),
    75: new Set(),
    100: new Set(),
  };
  const sectionViews = new Map<string, Set<string>>();
  const sectionDwell = new Map<string, { total: number; count: number }>();
  const sourceSessions = new Map<string, Set<string>>();
  const versionPv = new Map<number | null, number>();

  for (const ev of events) {
    const sid = ev.session_id ?? "";
    if (sid) sessions.add(sid);
    if (ev.visitor_id) visitors.add(ev.visitor_id);

    switch (ev.type) {
      case "pageview": {
        pageviews++;
        versionPv.set(ev.lp_version, (versionPv.get(ev.lp_version) ?? 0) + 1);
        // 流入元はpageview時点のreferrer/utm_sourceで判定
        const utm = ev.query?.utm_source;
        let name = utm || "";
        if (!name && ev.referrer) {
          try {
            name = new URL(ev.referrer).hostname;
          } catch {
            name = ev.referrer;
          }
        }
        if (!name) name = "直接/不明";
        if (!sourceSessions.has(name)) sourceSessions.set(name, new Set());
        if (sid) sourceSessions.get(name)!.add(sid);
        break;
      }
      case "scroll": {
        const mark = ev.value as 25 | 50 | 75 | 100;
        if (scrollSessions[mark] && sid) scrollSessions[mark].add(sid);
        break;
      }
      case "section_view": {
        if (!ev.section) break;
        if (!sectionViews.has(ev.section)) sectionViews.set(ev.section, new Set());
        if (sid) sectionViews.get(ev.section)!.add(sid);
        break;
      }
      case "section_dwell": {
        if (!ev.section || typeof ev.value !== "number") break;
        const d = sectionDwell.get(ev.section) ?? { total: 0, count: 0 };
        d.total += ev.value;
        d.count++;
        sectionDwell.set(ev.section, d);
        break;
      }
      case "cta_click": {
        ctaClicks++;
        if (sid) ctaSessions.add(sid);
        break;
      }
    }
  }

  const sessionCount = sessions.size;
  const sections: SectionStats[] = [...sectionViews.entries()].map(([id, set]) => {
    const dwell = sectionDwell.get(id);
    return {
      id,
      viewSessions: set.size,
      viewRate: ratio(set.size, sessionCount),
      avgDwellMs: dwell && dwell.count > 0 ? Math.round(dwell.total / dwell.count) : 0,
    };
  });

  return {
    site,
    periodStart: from.toISOString(),
    periodEnd: to.toISOString(),
    days,
    pageviews,
    sessions: sessionCount,
    visitors: visitors.size,
    ctaClicks,
    ctaSessions: ctaSessions.size,
    ctaRate: ratio(ctaSessions.size, sessionCount),
    scrollReach: {
      p25: ratio(scrollSessions[25].size, sessionCount),
      p50: ratio(scrollSessions[50].size, sessionCount),
      p75: ratio(scrollSessions[75].size, sessionCount),
      p100: ratio(scrollSessions[100].size, sessionCount),
    },
    sections,
    sources: [...sourceSessions.entries()]
      .map(([name, set]) => ({ name, sessions: set.size }))
      .sort((a, b) => b.sessions - a.sessions),
    versions: [...versionPv.entries()]
      .map(([version, pv]) => ({ version, pageviews: pv }))
      .sort((a, b) => (a.version ?? 0) - (b.version ?? 0)),
  };
}
