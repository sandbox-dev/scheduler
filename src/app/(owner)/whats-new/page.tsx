import { Card } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { getUpdates, seenUpdateIds } from "@/lib/updates";
import { MarkReadButton } from "./MarkReadButton";
import { NEW_TAG_STYLE } from "./newTagStyle";

function longDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

// The same list Timeline Builder shows. Each update stays New until cleared
// by hand (Adi, 2026-09-28); clearing here clears it there too.
export default async function WhatsNewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [updates, seen] = await Promise.all([getUpdates(supabase), user ? seenUpdateIds(supabase, user.id) : Promise.resolve(new Set<string>())]);
  const unread = updates.filter((u) => !seen.has(u.id));
  const dates = [...new Set(updates.map((u) => u.posted_on))];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div className="display" style={{ fontSize: 20, fontWeight: 800 }}>What&apos;s New</div>
        {unread.length > 0 && <MarkReadButton ids="all" label={`Mark All Read (${unread.length})`} />}
      </div>
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
                    <>
                      <span style={NEW_TAG_STYLE}>New</span>
                      <MarkReadButton ids={[u.id]} label="Mark Read" />
                    </>
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
