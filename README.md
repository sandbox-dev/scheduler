# Picture Day Scheduler

Internal scheduling tool for Sandbox Photographers — replaces the monthly spreadsheet + email thread for booking jobs, collecting staff availability, building the crew schedule, and running payroll mileage.

This is a [Next.js](https://nextjs.org) app backed by [Supabase](https://supabase.com) (database + login for the owners).

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com), sign up / sign in, and click **New project**.
2. Pick any name (e.g. "picture-day-scheduler") and a strong database password (save it somewhere — you likely won't need it again, but keep it safe). Choose a region close to you (e.g. US West).
3. Wait ~2 minutes for the project to finish setting up.

## 2. Load the database schema

1. In your new Supabase project, open **SQL Editor** in the left sidebar → **New query**.
2. Open [`supabase/schema.sql`](supabase/schema.sql) from this repo, copy its entire contents, paste into the SQL editor, and click **Run**.
3. This creates all the tables (jobs, schools, staff, availability, schedule, etc.) and the security rules that keep the data private to you and Julia.

This file is safe to re-run any time it changes (e.g. after a git pull) — it only adds what's missing and never touches existing data.

## 3. Create the owner logins (you and Julia)

Staff never log in — only the owners do.

1. In Supabase, go to **Authentication → Users → Add user**.
2. Create one user for yourself and one for Julia, with whatever email/password you each want to sign in with. Check **Auto Confirm User** so you don't need to click an email confirmation link.

That's it — no separate "sign up" screen exists in the app on purpose, so random people can't create accounts.

## 4. Connect the app to your Supabase project

1. In Supabase, go to **Project Settings → Data API** (or **API Keys**, depending on the dashboard version). Copy the **Project URL** and the **anon public** key.
2. In this project folder, copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
3. Open `.env.local` and paste in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Leave `NEXT_PUBLIC_SITE_URL` as `http://localhost:3000` for local development.

The other three env vars (`GOOGLE_MAPS_API_KEY`, `ZAPIER_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`) are optional — the app runs fine without them, just with staff-to-school distance lookups, and the Zapier import, turned off. See the sections below if you want those.

## 5. Run it locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you should land on the login page. Sign in with the owner account you created in step 3.

## 6. Deploy so you and Julia can use it from anywhere

1. Push this repo to GitHub (private repo is fine).
2. Go to [vercel.com](https://vercel.com), sign in, click **Add New → Project**, and import the GitHub repo.
3. Under **Environment Variables**, add every value from your `.env.local` — but set `NEXT_PUBLIC_SITE_URL` to whatever domain Vercel gives you (e.g. `https://picture-day-scheduler.vercel.app`), not `localhost`.
4. Click **Deploy**. Once it's live, that URL is what you and Julia use day-to-day.

If you later change `NEXT_PUBLIC_SITE_URL` (e.g. to a custom domain), redeploy so the availability links generated afterward use the new domain.

## Optional: staff-to-school distance lookups (Google Distance Matrix)

Without this, the schedule ranks staff by their fixed "distance from studio." With it, ranking uses each staff member's actual distance to the specific school being staffed — much more accurate.

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com), enable the **Distance Matrix API**, and set up billing (required by Google even for free-tier usage — at this app's scale you're very unlikely to ever be charged; see `src/lib/googleDistance.ts` for the batching logic that keeps usage low).
2. Create an API key restricted to the Distance Matrix API only, and set it as `GOOGLE_MAPS_API_KEY`.
3. On the Staff page, click **Sync distances** any time you add a new staff member or a new school — it only looks up pairs it hasn't seen before, so it's cheap and fast to re-run.

## Optional: auto-import bookings from Pixifi via Zapier

The app exposes `POST /api/webhooks/zapier/jobs`, which creates a bare-bones Job (name, category, dates) whenever it receives a request — leaving setups, supervisor, indoor/outdoor, and group-photo flags for an owner to confirm on the Jobs page afterward, same as manual entry.

1. Generate a random secret (anything long and unguessable) and set it as `ZAPIER_WEBHOOK_SECRET`.
2. Also set `SUPABASE_SERVICE_ROLE_KEY` from Supabase **Project Settings → API Keys → `service_role`**. This one bypasses all normal security rules, since Zapier has no logged-in session — keep it out of anywhere public.
3. In Zapier, create a Zap: trigger on a Pixifi "booking created" event, action = **Webhooks by Zapier → POST**.
   - URL: `https://your-deployed-domain.com/api/webhooks/zapier/jobs`
   - Headers: `x-webhook-secret: <the value you set above>`
   - Data (JSON body):
     ```json
     {
       "name": "{{booking name from Pixifi}}",
       "category": "K-8",
       "dates": ["{{booking date from Pixifi}}"],
       "school_name": "{{school name from Pixifi}}",
       "school_address": "{{school address from Pixifi}}",
       "round_trip_miles": 0
     }
     ```
   `category` must be `Preschool` or `K-12` (the only two qualification buckets — see below) — if Pixifi doesn't track an equivalent field, hardcode a reasonable default in the Zap and fix it up on the Jobs page afterward, same as anything else the algorithm can't know on its own. `setups` and `enrollment` are also optional in the payload; omitting `setups` flags the Picture Day "needs review" on the Jobs page rather than silently guessing.

   `school_name` is matched against your saved schools with a trailing "Makeup Day"/"Make Up Day"/"Make-Up Day" stripped first, so a make-up day booking correctly reuses the school's one real saved entry instead of creating a fresh duplicate every time (Pixifi isn't consistent about spacing/hyphenation on that suffix, all variants are handled). This only affects which saved school gets matched — the Job's own name still shows exactly what Pixifi sent.

## Email — sent through your own Gmail

Every email this app sends goes out through the studio's own Gmail account, using the same connection the timeline-builder app uses. They land in your real Sent folder and replies come back to your real inbox, exactly as if you'd typed them yourself.

**There is nothing to set up here if timeline-builder's Gmail is already connected** — both apps share one Supabase project, so this app reads the same stored connection. Reconnecting Gmail on the timeline app's Settings page fixes both apps at once.

The app needs two values to use that connection. Set them on this project as well:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

Both come from the same Google Cloud OAuth client the timeline app uses (Google Cloud Console → **APIs & Services → Credentials** → the OAuth 2.0 Client ID). They are the same values already set on the timeline-builder project; Vercel marks them Sensitive, so they can't be copied between projects from the command line — paste them in from Google Cloud Console.

### What gets sent, and when

| Email | Goes to | Triggered by |
| --- | --- | --- |
| Availability request | each staff member, with their own PIN | **Send availability request** on the Availability page |
| Availability reopened | one staff member | **Reopen** on their row |
| Availability reminder | staff who haven't responded | automatically, ~24h before the deadline |
| Deadline missed | the studio | automatically, once a deadline passes with people still outstanding |
| Someone submitted | the studio | a staff member submitting through their link |
| Everyone's submitted | the studio | the last active staff member submitting |
| Schedule confirmed | each assigned staff member, with a confirm link | **Approve schedule** / **Re-approve & notify** on the Schedule page |
| Confirm your schedule (reminder) | staff who haven't confirmed yet | automatically, ~48h after the schedule email went out |
| Schedule confirmations missing | the studio | automatically, ~72h after approving, if anyone's still unconfirmed |
| Everyone confirmed | the studio | the moment the last person clicks the confirm link |

The wording of all ten lives in `src/lib/emails.ts` and is unit tested — what a staff member receives is what's in that file.

### Why not Zapier

These used to go through Zapier catch hooks. A webhook POST can only confirm that *Zapier accepted the handoff*, which is not the same as an email existing: a real send in this system got a `2xx` back and never became a Zapier task (2026-08-07), and nothing surfaced it for weeks. Gmail's API answers the actual question, so every button now reports what really happened and names anyone who didn't get theirs.

The `ZAPIER_*` webhook variables for outgoing email are no longer used and can be deleted. `ZAPIER_WEBHOOK_SECRET` is unrelated and still needed — that's the *incoming* Pixifi booking import.

## The automatic reminder + missed-deadline check

When you click **Send availability request** you also set a "Respond by" date and time. From then on, without you doing anything:

- Anyone who hasn't responded gets one reminder email, about 24 hours before that deadline — once per person, per month.
- Once the deadline passes, if anyone is still outstanding, you get an email naming them. Silent if everyone's in.

This runs on a schedule rather than off a button, so it needs two things set up once:

1. **A cron secret** — generate any random value and set it as `CRON_SECRET` on the project.
2. **Vercel Cron** — this repo's `vercel.json` already defines a daily job hitting `/api/cron/availability-reminders` (Vercel's free Hobby plan only allows once-a-day schedules). After deploying, open the project in Vercel → **Settings → Cron Jobs** and confirm it's listed and switched on.

The emails themselves are sent by the app through your Gmail — there's no Zap involved.

Test it without waiting a day by setting a link's deadline to ~12 hours out and calling the route directly with the `Authorization: Bearer <CRON_SECRET>` header. The response tells you how many reminders went out and names anyone Gmail refused.

## Staff confirming they've seen their approved schedule

Every schedule-confirmed email includes a **Confirm** button/link — no login needed, same as the availability link. Clicking it takes them to a short page where clicking **Confirm** again is what actually records it (a real second click, not a bare link auto-confirming — an email security scanner pre-fetching links could otherwise mark someone confirmed before they ever saw the message).

From there, the same daily cron that handles availability reminders also runs this chase sequence automatically:

- **~48 hours** after the schedule went out, anyone who hasn't confirmed gets a reminder email with their schedule shown again and another Confirm link.
- **~72 hours** after you approved, if anyone's still unconfirmed, you get an email naming them. Silent if everyone's already in.
- The moment the **last** active staff member confirms, you get an "everyone confirmed" email — whenever that happens to land, not on the next cron tick.

Confirmations reset on every re-approve, so re-sending after a schedule change re-arms the whole sequence for everyone, same as the availability reminder resets on a fresh send. Confirmed sends are logged (who was notified, when) right under the Approve button on the Schedule page, same idea as the availability tracker's own send log.

## Letting someone redo their availability after they've submitted

Submitting locks a staff member out of changing their own answers for that month. If their availability changes afterwards, their row on the Availability response tracker shows **Submitted** with a **Reopen** button next to it.

Reopen unlocks them for that month and emails them the link plus their PIN again. When they open it, their existing dates come up already ticked and their note is still there, so they only change what actually moved. It asks you to confirm first, since it sends real email, and it's logged under "Already sent this month" so another owner can see it happened.

It deliberately leaves the month's "respond by" deadline and reminder settings alone — reopening one person isn't a new request cycle, and changing those would affect everyone else too.

If there's no email address on file for them or Gmail refuses the send, they're still reopened and the page tells you to send them the link yourself.

Note that **"Send availability request" always sets the deadline for the whole month**, even when you use "Choose who" to send to one person — the deadline belongs to the month's link, not to a person. Everyone the app has asked that month keeps their automatic reminder either way; sending to one extra person adds them to the list rather than replacing it.

## Optional: check Pixifi against this month's Jobs before sending availability requests

The **Check Pixifi** button on the Availability tracker page fetches Pixifi's own calendar feed directly (no Zap needed for this one) and compares it against this month's Jobs/Picture Days by date + school name, flagging anything booked in one system but missing from the other — e.g. a booking canceled in Pixifi that never got removed here, or a new booking that hasn't been entered into Scheduler yet.

1. In Pixifi, find your account's direct ICS calendar feed URL — it looks like `https://www.pixifi.com/gcal/<a long token>/`. This is a no-login link straight from Pixifi, not something you set up through Zapier or Google Calendar.
2. Set it as `PIXIFI_ICS_FEED_URL` (Vercel: Production + Preview, same as the other server-only vars).

Leave it unset to skip this — the button will show "no feed configured, nothing checked" instead of erroring.

## How the pieces fit together

- **Jobs** — book a school job, paste in its Picture Days (date + setups per line, or leave setups off a line if unknown — it's flagged "needs review" until you confirm it). Category is just `Preschool`/`K-12` for staff matching; a separate "school type" field (TK-8, Pre-8, High School, etc.) and enrollment (number of students) are there purely for your reference. Flag a day as outdoor, "+ group photo", or "babies" as needed (babies-flagged days only offer Babies Photography-qualified staff for the Photographer slot). "Saved schools" is collapsed by default — click to expand, search by name, edit a school's name/address/mileage (only saves when you click Save, not on blur), or remove one you no longer need (safe any time — an existing job's own data is untouched, it only clears that job's shortcut link). Browse other months with the month picker at the top.
- **Staff** — your roster: roles (Photographer/Assistant/Supervisor), which categories/specialties they're cleared for, booking priority (1-5, higher gets booked first — set it low for anyone who should be booked last regardless of actual tenure), and home city/email. "Sync distances" looks up real staff-to-school distances for ranking (see above). Deactivated staff (e.g. someone who's left) are hidden from the roster by default — use "Show inactive" above the table to bring them back into view or reactivate them, and are never offered as a candidate for a new assignment while inactive.
- **Availability** — click "Generate this month's link" and send that single link to staff yourself (text/email), or use "Send availability request" to email people individually with their own PIN, after setting a "Respond by" deadline (see below). The pink "Check Pixifi" button right above Send compares this month's Jobs against Pixifi's own calendar feed and flags any mismatch in-app before you notify staff (see "Optional: check Pixifi" above) — the Send button's confirmation also reminds you to run it first. Defaults to everyone active; click "Choose who" to narrow it to specific people instead — e.g. a staff member added mid-month (no need to re-notify everyone who's already responded), or re-flagging a last-minute new date to just the people you want to ask about it. **This sends real email with no undo** — it always asks you to confirm exactly who and what deadline first, and reports back exactly how many emails Gmail actually accepted and names anyone who didn't get one (green when everything went, amber when something didn't) — never assume a click went through silently either way. Copies land in your own Gmail Sent folder, which is independent proof. Every send is also logged (who sent it, when, and to whom) right above the Send button, so if you and Julia or Steph both have owner logins, whoever goes to send next can see it's already been done this month before sending again. On the link, staff pick their name and enter their own PIN before they see anything — they can only view/edit their own answers, never anyone else's. They tap their available dates and can leave a free-text note (scheduling preference, a hard-out time, etc.) — purely informational, shown to you in the response tracker alongside their actual dates. Submitting locks it (they can't come back and change it themselves) — their row then shows **Submitted** with a **Reopen** button that unlocks them and re-sends their link if their availability changes. You can also still adjust it directly from the response tracker — each click asks you to confirm the person, date, and new status first, since it's easy to tap the wrong one while scanning the table. Inactive staff never appear on the link or in the response tracker.
- **Trainee** — check "Trainee?" on a Picture Day (Jobs page) to add one supplemental Trainee slot. Unlike the other roles, any active staff member is eligible — no separate tagging needed.
- **Schedule** — "Generate schedule" auto-assigns every role slot by priority → category/specialty match → distance from the job, respecting who's marked available. Any slot's dropdown shows every qualified person, available or not, grouped accordingly — so a last-minute swap is always possible even if it wasn't planned for. Unfilled slots are flagged rather than left blank.
  - **List** view for editing, **Calendar** view (Month or Week, Monday-start) to see everything at a glance — click a day to jump back to the editable list.
  - **By Staff** view shows each person's assigned dates/roles/schools for the month, with a CSV export.
  - **Approve schedule** marks the month final, asks you to confirm exactly who's about to be emailed, then emails each staff member their confirmed dates through your Gmail with a link for them to confirm they've seen it — reporting who actually received one, and logging the send for a second owner login to see. See "Staff confirming they've seen their approved schedule" above for the automatic chase sequence that follows.
- **Payroll** — pick a date range and see round-trip miles × $0.75/mile per person, based on who's actually on the finalized schedule. Export as CSV for payroll.
- **Print weekly sheet** — from the Schedule page, opens a clean, plain page grouped by week for prepping gear, including outdoor/group-photo notes.

The crew rule, mileage rate, and studio address are defined once in [`src/lib/types.ts`](src/lib/types.ts) if they ever need to change.

## Staff portal — a real login for staff, separate from yours

Staff can sign in at `/team/login` (a different login from the owner one) and see just their own upcoming Picture Days: school, address, arrival/start/end time, their crew for the day, and the same day-of details (backdrop, wifi, parking notes, etc.) that used to only live in Pixifi's copy-pasted event notes. It's genuinely scoped at the database level — a staff login can only ever read its own data, enforced the same way owner-only data already is, not just hidden in the UI.

**Calendar feed**: each staff member also gets their own personal, subscribable calendar link (shown on `/team` itself) — subscribe once in Apple/Google Calendar and their real schedule shows up automatically from then on, no re-adding them to Pixifi's calendar by hand after every scheduling change. Real times when a timeline's been sent/approved, otherwise an honest all-day placeholder rather than a guessed time.

**Rollout status**: internal testing only (Adi + Julia), not handed to real staff yet — see project memory for the current status before assuming this is fully rolled out.

## Not built in v1 (by design)

- Sending the availability link automatically via text/email (you send it manually for now).
- Texting staff directly (no SMS/Twilio integration) — the Zapier email hookup above covers automated notification without that added cost/complexity.
