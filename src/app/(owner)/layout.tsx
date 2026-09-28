import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { getUpdates, seenUpdateIds } from "@/lib/updates";

export default async function OwnerLayout({ children }: { children: React.ReactNode }) {
  // What's New tab number: shared list updates this login hasn't seen.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let unseen = 0;
  if (user) {
    const [updates, seen] = await Promise.all([getUpdates(supabase), seenUpdateIds(supabase, user.id)]);
    unseen = updates.filter((u) => !seen.has(u.id)).length;
  }
  return (
    <div>
      <Nav unseenUpdates={unseen} />
      <div className="no-print" style={{ padding: 24, maxWidth: 1040, margin: "0 auto" }}>
        {children}
      </div>
    </div>
  );
}
