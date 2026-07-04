import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/** サーバ専用。環境変数未設定ならnullを返し、呼び出し側がフォールバックする */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL;
  // service roleがあれば優先(スコープ2のレポート生成でselectに必要)。
  // なければanonキー(insert専用RLSポリシーで計測書き込みだけ通る)
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    client = null;
    return client;
  }
  client = createClient(url, key, {
    auth: { persistSession: false },
  });
  return client;
}
