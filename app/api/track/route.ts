import { getSupabase } from "@/lib/supabase";
import fs from "node:fs";
import path from "node:path";
import type { TrackPayload } from "@/lib/types";

export const runtime = "nodejs";

// タグ版(Light)は他ドメインのLPから送信されるためCORSを開放する。
// 計測データに秘匿情報はなく、site slugの偽装はサーバ側で集計時に弾ける。
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request) {
  let payload: TrackPayload;
  try {
    // sendBeaconはContent-Typeがtext/plainになるためreq.json()は使わない
    payload = JSON.parse(await req.text());
  } catch {
    return new Response("bad request", { status: 400, headers: CORS_HEADERS });
  }

  if (
    !payload ||
    typeof payload.site !== "string" ||
    !/^[a-z0-9-]{1,64}$/.test(payload.site) ||
    !Array.isArray(payload.events) ||
    payload.events.length === 0 ||
    payload.events.length > 50
  ) {
    return new Response("bad request", { status: 400, headers: CORS_HEADERS });
  }

  const ua = req.headers.get("user-agent") ?? "";
  const rows = payload.events.map((ev) => ({
    site_slug: payload.site,
    lp_version: payload.v ? Number(payload.v) || null : null,
    visitor_id: String(payload.vid ?? "").slice(0, 64),
    session_id: String(payload.sid ?? "").slice(0, 64),
    type: String(ev.t).slice(0, 32),
    section: ev.s ? String(ev.s).slice(0, 64) : null,
    value: typeof ev.val === "number" ? ev.val : null,
    meta: ev.m ?? null,
    url: String(payload.url ?? "").slice(0, 512),
    referrer: String(payload.ref ?? "").slice(0, 512),
    query: payload.q ?? null,
    ua: ua.slice(0, 256),
    created_at: new Date(
      typeof ev.ts === "number" && ev.ts > 0 ? ev.ts : Date.now()
    ).toISOString(),
  }));

  const supabase = getSupabase();
  if (supabase) {
    const { error } = await supabase.from("events").insert(rows);
    if (error) {
      console.error("track insert failed:", error.message);
      return new Response("error", { status: 500, headers: CORS_HEADERS });
    }
  } else {
    // ローカル開発フォールバック: Supabase未設定なら NDJSON に追記
    const dir = path.join(process.cwd(), ".data");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(
      path.join(dir, "events.ndjson"),
      rows.map((r) => JSON.stringify(r)).join("\n") + "\n"
    );
  }

  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
