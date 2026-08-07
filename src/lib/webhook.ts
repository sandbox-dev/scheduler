import "server-only";

// Fire-and-forget Zapier webhook POST, logging any failure and retrying
// transient ones. A wrong or stale URL doesn't throw — fetch only throws on
// a real network failure; a 404 from a dead Zapier hook resolves normally
// with ok:false — so checking res.ok explicitly is the only way a bad
// webhook is ever diagnosable from Vercel logs instead of just silently
// never notifying anyone. This exact failure mode went unnoticed for real
// staff availability submissions until Adi asked why she never got a "you
// submitted" email (2026-08-07) — investigation ruled out a stale URL,
// wrong Zap, and Zapier account/task limits in turn, leaving a genuine
// intermittent network failure between Vercel and hooks.zapier.com
// (observed directly: one real call failed with ECONNRESET during the TLS
// handshake; a different real call got a 2xx back but never became a
// Zapier task). Retrying gives a transient failure like that a real second
// chance instead of just logging it and moving on.
// Returns whether it eventually succeeded, so a caller counting "N sent"
// reports what really happened rather than how many attempts were made.
const RETRY_DELAYS_MS = [500, 1500];

export async function postWebhook(label: string, url: string, body: unknown): Promise<boolean> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return true;
      console.error(`${label} webhook returned ${res.status} (attempt ${attempt + 1})`);
    } catch (err) {
      console.error(`${label} webhook request failed (attempt ${attempt + 1})`, err);
    }

    if (attempt >= RETRY_DELAYS_MS.length) return false;
    await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
  }
}
