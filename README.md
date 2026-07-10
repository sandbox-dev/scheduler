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

## Optional: email staff their confirmed schedule when you approve it

On the Schedule page, clicking **Approve schedule** always marks that month approved. If you also set up this Zap, it additionally sends one email per staff member with their confirmed dates, roles, and schools.

1. Add each staff member's email on the Staff page (only `name` is required today — this feature needs `email` filled in per person).
2. In Zapier, create a Zap: trigger = **Webhooks by Zapier → Catch Hook**. Copy the custom webhook URL it gives you and set it as `ZAPIER_SCHEDULE_WEBHOOK_URL`.
3. Add an action after it — **Email by Zapier** (no account needed) or **Gmail → Send Email** if you'd rather it come from your own address. Send To: `staff_email`, and use `summary` (a plain-text list of their dates) or the `days` array (structured, if you want to format a table) in the body.
4. Test by clicking **Approve schedule** in the app — the button reports how many people were emailed and flags anyone skipped for missing an email address.

This is optional — approving works fine without it, it just won't notify anyone.

## Optional: email staff their availability link + PIN with one click

On the Availability page, once you've generated a month's link, clicking **Send availability request** emails every active staff member individually — the shared link plus their own 4-digit PIN (shown on the Availability response tracker for reference). Each person picks their name on the link, enters their own PIN, and can only see/edit their own answers; once they submit, it locks (you can still override manually from the response tracker).

1. Add each staff member's email on the Staff page.
2. In Zapier, create a new Zap: trigger = **Webhooks by Zapier → Catch Hook**. Copy the custom webhook URL it gives you and set it as `ZAPIER_AVAILABILITY_WEBHOOK_URL`.
3. Add an action after it — **Email by Zapier** or **Gmail → Send Email**. Send To: `staff_email`, and include `link` and `pin` in the body (e.g. "Your PIN: {{pin}}").
4. Test by clicking **Send availability request** in the app.

This is optional — the link still works fine without it, you'd just copy/paste it yourself instead of one-click emailing everyone.

## How the pieces fit together

- **Jobs** — book a school job, paste in its Picture Days (date + setups per line, or leave setups off a line if unknown — it's flagged "needs review" until you confirm it). Category is just `Preschool`/`K-12` for staff matching; a separate "school type" field (TK-8, Pre-8, High School, etc.) and enrollment (number of students) are there purely for your reference. Flag a day as outdoor or "+ group photo" as needed. "Saved schools" is collapsed by default — click to expand and keep addresses/mileage current. Browse other months with the month picker at the top.
- **Staff** — your roster: roles (Photographer/Assistant/Supervisor), which categories/specialties they're cleared for, seniority, and home city/email. "Sync distances" looks up real staff-to-school distances for ranking (see above).
- **Availability** — click "Generate this month's link" and send that single link to staff yourself (text/email), or use "Send availability request" to email everyone individually with their own PIN in one click (see below). On the link, staff pick their name and enter their own PIN before they see anything — they can only view/edit their own answers, never anyone else's. They tap their available dates and can leave a free-text note (scheduling preference, a hard-out time, etc.) — purely informational, shown to you in the response tracker alongside their actual dates. Submitting locks it (they can't come back and change it themselves); you can still adjust it directly from the response tracker if something changes.
- **Trainee** — check "Trainee?" on a Picture Day (Jobs page) to add one supplemental Trainee slot. Unlike the other roles, any active staff member is eligible — no separate tagging needed.
- **Schedule** — "Generate schedule" auto-assigns every role slot by seniority → category/specialty match → distance from the job, respecting who's marked available. Any slot's dropdown shows every qualified person, available or not, grouped accordingly — so a last-minute swap is always possible even if it wasn't planned for. Unfilled slots are flagged rather than left blank.
  - **List** view for editing, **Calendar** view (Month or Week, Monday-start) to see everything at a glance — click a day to jump back to the editable list.
  - **By Staff** view shows each person's assigned dates/roles/schools for the month, with a CSV export.
  - **Approve schedule** marks the month final and (if the optional Zapier email hookup below is configured) emails each staff member their confirmed dates.
- **Payroll** — pick a date range and see round-trip miles × $0.75/mile per person, based on who's actually on the finalized schedule. Export as CSV for payroll.
- **Print weekly sheet** — from the Schedule page, opens a clean, plain page grouped by week for prepping gear, including outdoor/group-photo notes.

The crew rule, mileage rate, and studio address are defined once in [`src/lib/types.ts`](src/lib/types.ts) if they ever need to change.

## Not built in v1 (by design)

- Sending the availability link automatically via text/email (you send it manually for now).
- Texting staff directly (no SMS/Twilio integration) — the Zapier email hookup above covers automated notification without that added cost/complexity.
