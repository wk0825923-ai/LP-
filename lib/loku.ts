// LP秘書: Loku REST APIでLINEメッセージを即時送信
// SR Assistで実証済みの構成: POST /api/v1/messages + Idempotency-Keyヘッダー必須

const LOKU_BASE = "https://l.oku-ai.co.jp/api/v1";

export async function sendLineText(text: string): Promise<void> {
  const apiKey = process.env.LOKU_API_KEY;
  const friendId = process.env.LOKU_FRIEND_ID;
  if (!apiKey || !friendId) {
    throw new Error("LOKU_API_KEY / LOKU_FRIEND_ID が未設定です");
  }

  const res = await fetch(`${LOKU_BASE}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      friendId,
      messages: [{ type: "text", text }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Loku送信失敗: ${res.status} ${body.slice(0, 300)}`);
  }
}
