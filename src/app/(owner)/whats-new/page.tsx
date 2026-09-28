import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getUpdates, markUpdatesSeen, seenUpdateIds } from "@/lib/updates";
import { RefreshOnce } from "./RefreshOnce";

function longDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

// The same list Timeline Builder shows — opening it here counts as seen there too.
export default async function WhatsNewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [updates, seen] = await Promise.all([getUpdates(supabase), user ? seenUpdateIds(supabase, user.id) : Promise.resolve(new Set<string>())]);
  const hadUnseen = updates.some((u) => !seen.has(u.id));
  if (user && hadUnseen) await markUpdatesSeen(supabase, user.id, updates.map((u) => u.id));
  const dates = [...new Set(updates.map((u) => u.posted_on))];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {hadUnseen && <RefreshOnce />}
      <div className="display" style={{ fontSize: 20, fontWeight: 800 }}>What&apos;s New</div>
      {updates.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13.5 }}>Nothing yet.</div>}
      {dates.map((date) => (
        <Card key={date}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
            {longDate(date)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {updates.filter((u) => u.posted_on === date).map((u) => (
              <div key={u.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 3 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{u.title}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", border: "1px solid var(--line)", borderRadius: 999, padding: "0 7px" }}>{u.app}</span>
                  {!seen.has(u.id) && (
                    <span style={{ fontSize: 11, fontWeight: 800, background: "var(--bad)", color: "#fff", borderRadius: 999, padding: "0 7px" }}>New</span>
                  )}
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{u.body}</div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
