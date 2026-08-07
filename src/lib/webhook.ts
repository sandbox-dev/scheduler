import "server-only";

// Fire-and-forget Zapier webhook POST, logging any failure. A wrong or
// stale URL doesn't throw — fetch only throws on a real network failure; a
// 404 from a dead Zapier hook resolves normally with ok:false — so checking
// res.ok explicitly is the only way a bad webhook is ever diagnosable from
// Vercel logs instead of just silently never notifying anyone. This exact
// failure mode went unnoticed for real staff availability submissions
// until Adi asked why she never got a "you submitted" email (2026-08-07) —
// the webhook URL was stale (didn't match the Zap's actual Catch Hook
// after it had been recreated) and every call had been failing invisibly.
// Returns whether it actually succeeded, so a caller counting "N sent"
// reports what really happened rather than how many attempts were made.
export async function postWebhook(label: string, url: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`${label} webhook returned ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`${label} webhook request failed`, err);
    return false;
  }
}
