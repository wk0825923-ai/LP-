# LP秘書 — app

LPホスティング+計測+イベント基盤(MVPスコープ1)。事業計画は `../business-plan.md`。

## 構成

- `content/sites/*.json` — LPは構造化JSON+テンプレートで保持(HTML直編集させない)。`version` を上げて前後比較する
- `app/[site]/page.tsx` + `components/sections.tsx` — JSONからLPをレンダリング
- `public/t.js` — 自前計測スクリプト(pageview / scroll / section_view / section_dwell / cta_click)。タグ版(Light)は `data-endpoint` 指定で他ドメインでも動く
- `app/api/track/route.ts` — イベント収集(CORS開放、sendBeacon対応)。Supabase未設定時は `.data/events.ndjson` に追記(ローカル開発)
- `supabase/migrations/0001_init.sql` — sites / events テーブル
- `supabase/migrations/0002_reports.sql` — reports テーブル(スコープ2)
- `lib/stats.ts` → `lib/report.ts` — events集計 → LINEサマリー+詳細Markdown生成。所見は `ANTHROPIC_API_KEY` があればClaude(Sonnet)、なければルールベース
- `app/api/reports/route.ts` — レポート生成トリガー(`x-admin-key` 認証)。`{site, days?, send?, dryRun?}`。`send: true` でLoku経由のLINE送信(レビューゲート=自分宛て)
- `app/reports/[id]/page.tsx` — Web詳細ビュー(uuidが実質のアクセストークン)

## ローカル起動

```
npm run dev
# http://localhost:3000/studio-lien
```

計測イベントは `.data/events.ndjson` に落ちる(Supabase未設定時)。

## 本番(すべて無料枠)

1. Supabase無料枠で新規プロジェクト作成 → SQL Editorで `supabase/migrations/0001_init.sql` を実行(既存の本番プロジェクトには適用しない)
2. Vercel(Hobby)にデプロイ。環境変数: `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
3. `content/sites/<slug>.json` の `line.ctaHref` にLokuで発行した経路リンクを設定

## 環境変数

- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`(or `SUPABASE_ANON_KEY`)
- `ADMIN_KEY` — /api/reports の認証
- `LOKU_API_KEY` / `LOKU_FRIEND_ID` — LINEサマリー送信先
- `ANTHROPIC_API_KEY`(任意) — 所見のAI生成。未設定ならルールベース
- `PUBLIC_ORIGIN`(任意) — レポートURLの生成元(未設定ならリクエストのorigin)

## 次のスコープ

3. 提案→LINE承認→デプロイ / 4. Loku read合成 / 5. LP健康診断 / 6. タグ版Light
