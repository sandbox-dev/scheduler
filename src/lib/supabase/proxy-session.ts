import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /api/webhooks and /api/cron are intentionally public here — those routes
// authenticate themselves via a shared secret (ZAPIER_WEBHOOK_SECRET /
// CRON_SECRET), since external triggers like Zapier and Vercel Cron have no
// logged-in session for this middleware to check. /crew/login is the staff
// portal's own sign-in page, same idea as /login for owners.
const PUBLIC_PATHS = ["/login", "/crew/login", "/availability", "/auth", "/api/webhooks", "/api/cron"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// The mobile staff view — a second kind of authenticated account (see
// staff.auth_user_id / is_staff_account() in supabase/schema.sql) that must
// never wander into the owner-only routes below, and that owners should
// never end up stuck inside by mistake.
const STAFF_AREA_PATH = "/crew";

function isStaffAreaPath(pathname: string) {
  return pathname === STAFF_AREA_PATH || pathname.startsWith(`${STAFF_AREA_PATH}/`);
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  if (!user) {
    if (!isPublicPath(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = isStaffAreaPath(pathname) ? "/crew/login" : "/login";
      return NextResponse.redirect(url);
    }
    return response;
  }

  // Logged in — figure out once whether this is a staff-scoped login (a
  // staff row linked via auth_user_id) or a normal owner login. RLS already
  // limits this query to "does MY OWN auth_user_id match a staff row?" (see
  // the staff-scoped read policy in supabase/schema.sql), so this can't be
  // used to probe anyone else's account.
  const { data: staffRow } = await supabase.from("staff").select("id").eq("auth_user_id", user.id).maybeSingle();
  const isStaffAccount = !!staffRow;

  if (pathname === "/login" || pathname === "/crew/login") {
    const url = request.nextUrl.clone();
    url.pathname = isStaffAccount ? "/crew" : "/overview";
    return NextResponse.redirect(url);
  }

  if (isStaffAccount && !isStaffAreaPath(pathname) && !isPublicPath(pathname)) {
    // A staff-scoped login trying to reach an owner route — send them back
    // to their own area instead of letting them in.
    const url = request.nextUrl.clone();
    url.pathname = "/crew";
    return NextResponse.redirect(url);
  }

  if (!isStaffAccount && isStaffAreaPath(pathname)) {
    // An owner landed on the staff area by mistake — send them back to the
    // owner app rather than showing them (or letting them fall into) a
    // staff-only page.
    const url = request.nextUrl.clone();
    url.pathname = "/overview";
    return NextResponse.redirect(url);
  }

  return response;
}
