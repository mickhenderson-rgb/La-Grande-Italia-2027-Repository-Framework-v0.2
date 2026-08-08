# COMPASS-TOS — Handover #2 (continuation)

**Covers:** everything built/changed after the original handover — Builds 40 through 47, the URL/hosting migration to `/TOS`, and the new user-accounts + trip-sharing system.
**Read alongside:** `COMPASS-TOS-HANDOVER.md` (the original) — it still holds the deep early history (Builds 1–39), the "no-frameworks / zero-dependency" philosophy, and the module-by-module tour. This document assumes you've skimmed that one. Where the two disagree on current facts (URL, deploy path, auth model), **this document wins**.

---

## 1. What COMPASS-TOS is (30-second recap)

A self-hosted, multi-trip, multi-user **travel-planning web app** ("Travel Operating System"). Plain vanilla JS/HTML/CSS frontend; a **zero-dependency Node.js** backend (`server.js`, built-ins only — `http`/`fs`/`path`/`crypto`/`child_process`); JSON files on disk as the database. Deliberately **no frameworks, no npm dependencies** — this is a hard, repeatedly-honored constraint. Owned by **Mick Henderson**, used by his family.

---

## 2. Current live state

- **Public URL:** `https://www.deploytelco.com.au/TOS` (moved from `/COMPASS-TOS` — see §6).
- **Hosting:** VentraIP, cPanel + LiteSpeed, "Setup Node.js App" tool. Node **10.24.1** on the server (ancient — matters for dependencies; see §9).
- **Server app folder:** `~/TOS` (i.e. `/home/deployte/TOS`) — was `~/COMPASS-TOS`, renamed by cPanel during the URL change.
- **GitHub repo (public):** `https://github.com/mickhenderson-rgb/La-Grande-Italia-2027-Repository-Framework-v0.2`
- **Local working copy (Mick's Windows machine):** `C:\Users\MickHenderson\COMPASS-TOS\La-Grande-Italia-2027-Repository-Framework-v0.2\` (the git repo). The two handover `.md` files live one level up in `C:\Users\MickHenderson\COMPASS-TOS\`.
- **Service worker cache version:** currently `compass-tos-v17` (bumped almost every build — see §8).
- **Auth model:** **username + password accounts** with cookie sessions and trip isolation (replaced the old HTTP Basic Auth). See §5.

---

## 3. Architecture essentials (what to keep honoring)

- **Zero dependencies, no frameworks.** `npm install` must complete instantly with nothing to download. Password hashing uses Node's built-in `crypto.scrypt` (NOT bcrypt). "Database" is JSON files (NOT SQLite). Email uses the server's `sendmail` via `child_process` (NOT nodemailer).
- **JSON stores facts only** — never calculated/derived values. Day dates are recalculated from the trip start date + flight facts (`app/dates.js`), never stored as truth.
- **`window.API_BASE`** (client) = `window.location.pathname.replace(/\/[^/]*$/, "")` — computes the subfolder the app runs from (`/TOS`), used to prefix every fetch. **`BASE_PATH`** (server env var) = the same prefix, which `server.js` strips from incoming URLs (the LiteSpeed proxy does NOT strip it). They must always match the mount path.
- **House JS style:** extreme vertical spacing (a blank line between almost every statement). Match it.
- **CSS custom properties that exist** (in `assets/css/themes/light.css`): `--color-bg`, `--color-primary` (#34495E), `--color-secondary` (#C79C5D), `--color-text`, `--radius`. Don't invent others. Palette: navy `#243447`/`#34495E`, gold `#C79C5D`, cream `#F8F5F0`.
- **Deliver complete replacement files**, not diffs, when handing code to Mick.
- **Escaping:** several modules had a weak `esc()` (quotes only); they've been upgraded to full `& < > "` escaping as they were touched (planner, budget, landing, currency, auth, sharing, itinerary-import). `landing.js` also has `jsArg()` for JS-string-safe `onclick` args (handles apostrophes in trip names).

---

## 4. Work completed this session (Builds 40–47 + fixes)

Build numbers are Mick's spec labels; they were delivered somewhat out of order.

- **Build 40 — Edit Day Title.** Added `showEditDayForm`/`renderEditDayForm`/`saveEditedDay`/`closeEditDayForm` to `app/planner.js` (there was previously no way to rename an existing day). Persists the whole `journey.json` via `PUT /api/data/:project/journey`.
- **Build 41 — Itinerary Bulk Import.** New `app/itinerary-import.js` (grid + paste + help tabs; columns Date/From/To/Type/Notes → journey days). Reachable via sidebar "Itinerary" and a trip-setup "Create & Load Itinerary" button. Deviations: no `destinations/<slug>.json` files written (destinations derive live from `day.location`); Replace is the default mode (fresh trips already have blank seeded days); one batched write; dates re-sequence via `Dates.recalculateJourney()`.
- **Build 42 — Currency Conversion.** New `app/currency.js` using the **Frankfurter** API. IMPORTANT: the endpoint is `https://api.frankfurter.dev/v1/latest?base=X&symbols=Y` — the old `api.frankfurter.app` now 301-redirects and the redirect drops CORS headers, so the browser fetch fails. Pair-keyed 1-hour in-memory cache. Sidebar "💱 Currency" calculator + `Currency.inlineConversion(price)` injected into all 5 research modules' `renderItem`. Display currency = `project.displayCurrency` falling back to `project.currency`. Also added `Currency.currencyOptions(selected)` (used by the currency dropdowns, below).
- **Currency dropdowns.** All free-text currency inputs across the 5 research modules + expenses + budget-estimate form + trip-setup converted to `<select>` (via `Currency.currencyOptions`).
- **Build 43 — Calendar date pre-selection.** `Dates.getDayDate(dayNumber)` → journey day's ISO date. Each booking form's empty date input pre-fills the relevant day's date (saved values always win). Real fields: accommodation `dates.checkIn/checkOut` via `dayRange[0]/[1]`; activities `schedule.date`/restaurants `reservation.date` via `dayRange[0]`; flights `departure.date`/`arrival.date` and transport `schedule.date`/`schedule.arriveDate` via `item.day` (flights/transport are day-keyed, NOT dayRange).
- **Build 44 — Day Card Data Snapshot.** Rewrote `app/planner.js` `renderDay` — collapsible per-category sections (Flights/Accommodation/Activities/Restaurants/Transport) drawn live from the research collections; status-count summary + first-item snippet when collapsed; full details + status badges + "Open Details" (calls `<Module>.edit(id)`) + booking links + top-3-with-"+N more" overflow when expanded. Fixed an XSS hole (planner `esc` only escaped quotes).
- **Build 45 — Budget spend tiers.** (There were two Build-45 specs; the tiered one supersedes the earlier single-tier currency-aware one.) `app/budget.js` tiers every priced item by status via `getTier()`: ESTIMATED (Research/Shortlisted/Selected), ALLOCATED (Booked), ACTUAL (Travel/Review + logged expenses). Per-currency native subtotals + converted subtotals + grand totals via the Currency module; async fetch-then-rerender; graceful "Rate unavailable". Optional **budget cap** stored at `project.project.budgetCap` (a number in the trip's home currency), converted to display currency for `remaining = cap - actual`. Kept the Edit-Estimate form.
- **Build 46 — Dynamic headers.** The app header is rendered by `Layout.render()` in `app/layout.js` (NOT index.html). Replaced hardcoded "La Grande Italia 2027" with the live `project.name` and set `document.title` on every render. `landing.js` resets the tab title on the trip-selection screen. (Product/brand name stays "COMPASS-TOS"; only trip name is dynamic.)
- **Landing button restyle.** Trip cards: "Open Trip" is a large primary button; Archive/Delete are small secondary.
- **URL migration to `/TOS`** + service-worker cross-origin fix + trailing-slash redirect (see §6).
- **Build 47 — User accounts & trip isolation** (Phase 1) + **trip sharing & two-step delete** (Phase 2) + **invite emails** + **copyable invite links** (see §5). This is the biggest change and the most important thing to understand.

---

## 5. The accounts / sharing system (Build 47) — READ THIS CAREFULLY

Delivered **dependency-free** because the spec's SQLite + bcrypt are native modules that won't compile on the Node-10 cPanel host and break the zero-dep rule. Mick explicitly chose this route, and login by **username** (email collected at signup, used to tie invites to a person).

### Storage — all JSON under `data/auth/` (gitignored, server-only)
- `users.json` → `{ users: [{ id, username, usernameLower, email, salt, hash, createdAt, lastLogin }] }` (scrypt salt + 64-byte hash, no plaintext).
- `sessions.json` → `{ sessions: [{ id, userId, createdAt, expiresAt }] }` (opaque random 32-byte token = the cookie value; server-side lookup IS the validation, no HMAC needed).
- `invites.json` → `{ invites: [{ token, createdBy, email, note, createdAt, expiresAt, used, usedAt }] }`.
- `trips.json` (ownership) → `{ trips: { <tripId>: { owner: userId, name, createdAt, collaborators: [{userId, permission, addedAt}], pendingShares: [{email, permission, token, invitedAt}] } } }`.
- **`.gitignore` excludes `data/auth/`** (the repo is public — hashes/sessions must never be committed) and `node_modules/`.

### Auth flow
- Session cookie `compass_session`: `HttpOnly; SameSite=Strict; Path=<BASE_PATH>/`, and **`Secure` only when the request is HTTPS** (checked via `x-forwarded-proto` — so it also works over local http for testing). 7-day expiry (`SESSION_EXPIRY` env, ms).
- **Static app shell (index.html, app/*, assets/*) is public** so the login screen can load. Everything else is gated:
  - `/api/*` → 401 without a session.
  - `/data/projects/<id>/*` (trip data is fetched as **static files**) → 401 without session, **403 without ownership/collaboration** (critical — this is how trip data is actually read).
  - Write routes (`/api/data|items|upload|journal/:project`) → `canEditTrip`.
  - `/api/projects/:id` DELETE/PATCH-archive → owner only.
- **Bootstrap:** the FIRST account to register needs no invite and **claims all existing trip folders** (so the pre-accounts trips belong to whoever sets up first — must be Mick, before sharing the URL). After that, registration is invite-gated (`REGISTRATION_MODE=invite` default; set `open` to allow free signup).

### Server routes (all in `server.js`)
- `POST /auth/register` `{username, password, confirmPassword, email, inviteToken?}` — validates, hashes, first-user bootstrap + `claimPendingShares`, sets cookie.
- `POST /auth/login` `{username, password}` — generic error, sets cookie.
- `POST /auth/logout`, `GET /auth/me` (returns `{user, registrationMode, needsBootstrap}`), `POST /auth/invite` `{email?, note?}` (generates a token, optionally emails it), `GET /auth/invites`.
- `GET/POST/DELETE /api/trips/:id/share` (owner only) — list / add collaborator (by username or email; unregistered email → pending-share + invite) / remove. Adds `role` + `permission` to the `/api/projects` list so the UI shows Share/Delete for owned trips and a "Shared with you" badge for collaborator trips.

### Invite emails (best-effort, zero-dep)
- `sendInviteEmail`/`buildInviteEmail` pipe an RFC-ish message to `/usr/sbin/sendmail -t -oi` via `child_process.spawn`. **The copyable invite link is ALWAYS returned/shown as a fallback**, so invites work even if mail is broken. Endpoints return an `emailed` flag.
- Env: `MAIL_FROM` (default `COMPASS-TOS <noreply@deploytelco.com.au>` — should be an address on the sending domain for SPF/DKIM), `MAIL_ENABLED=false` to disable, `SENDMAIL_PATH` override.
- **UNVERIFIED:** actual email delivery could not be tested from the dev sandbox. Mick must confirm live; shared-host mail may land in spam. Watch server log lines `[mail] invite email handed to sendmail…` vs `[mail] sendmail unavailable…`.

### Frontend
- `app/auth.js` (new) — login/register screens + logout; success does `location.reload()`.
- `core/bootstrap.js` — checks `/auth/me`; shows register (if `?invite=` in URL, or first-run, or open mode) / login / the app.
- `app/sidebar.js` — "Log Out" link.
- `app/landing.js` — "+ Invite Someone" → inline form (email optional) → **Get Invite Link** with a **Copy** button; role-based trip cards; two-step delete (`confirmDelete` → red confirmation screen → `reallyDelete`).
- `app/sharing.js` (new) — owner-only Share screen (add by username/email + permission, collaborator/pending lists + Remove, Copy button on pending link).

### "Invite to own trips" vs "Share a trip"
- **"+ Invite Someone"** (trip list) → the person gets their **own account + own private trips**.
- **"Share"** (on one of your trip cards) → gives someone read-only/read-write access to **that specific trip of yours**.

---

## 6. The URL migration to `/TOS` (and the saga — learn from it)

Mick changed the public URL from `/COMPASS-TOS` to `/TOS`. **No app code needed changing** (API_BASE/service-worker/manifest all derive the path). What DID matter:

1. **cPanel:** change ONLY the **Application URL** field to `TOS` and set **`BASE_PATH=/TOS`** (must match). **Do NOT touch "Application Root"** — Mick did, which made cPanel rename the app folder `~/COMPASS-TOS` → `~/TOS` and broke the CloudLinux app registration (503; toasts "No such application", "Unable to find app venv folder", "Config does not contain directory"). Recovery = align everything on `TOS` (Application Root = `TOS`, URL = `TOS`, BASE_PATH = `/TOS`), or **Destroy + Recreate** the Node app (Destroy does NOT delete the files in the app folder) and re-add all env vars.
2. **Service worker cross-origin bug** (found via console): the SW's catch-all fetch handler intercepted cross-origin requests and returned `Response.error()` → `net::ERR_FAILED` on the Frankfurter (and Open-Meteo) calls. **Fix:** `if (url.origin !== self.location.origin) return;` at the top of the SW fetch handler. (This had also been silently breaking the Weather live forecast.)
3. **Trailing-slash bug** (found via console): visiting `/TOS` without a trailing slash made the browser resolve every relative asset and `API_BASE` against the domain root (everything 404'd; a root-scoped zombie SW got registered). **Fix in `server.js`:** at the very top of the request handler, if `req.url === BASE_PATH` (or `BASE_PATH + "?"`), 302-redirect to `BASE_PATH + "/"`.
4. **Zombie service workers:** old SWs registered at `/COMPASS-TOS` (and once at the domain root) kept serving stale content in normal browsers (incognito worked). The user must **unregister all SWs + clear site data** once after such a move (`chrome://serviceworker-internals/` is the reliable way).

Documentation (`COMPASS-TOS-HANDOVER.md` §13 + memory) was updated for the `/TOS` URL; historical narrative there still references `/COMPASS-TOS` intentionally.

---

## 7. Data model (per trip, under `data/projects/<slug-id>/`)

Unchanged from the original handover: `project.json`, `journey.json`, the five research collections (`accommodation/activities/transport/restaurants/flights.json`, all `{version, schema, items:[]}`), `budget.json`, `expenses.json`, `journal.json`, `events.json`, `project-locations.json`, `bookings.json`, `weather.json`, optional `destinations/<slug>.json`, `uploads/`.

New fields introduced this session (all additive, ignored by older code): `journey.days[].activityType` and `.notes` (itinerary import); `project.project.displayCurrency` (currency); `project.project.budgetCap` (budget tiers). Item schemas were NOT changed.

**Ownership/accounts data lives OUTSIDE the trip folders**, in `data/auth/` (see §5) — deliberately, so a user can never grant themselves ownership by PUT-ing `project.json`.

Two placeholder test trips exist: `la-grande-italia-2027` and `sample-trip-two`. All data is placeholder/disposable per Mick.

---

## 8. Deployment procedure (current)

Mick edits locally (or you hand him complete files) → GitHub Desktop commit + push → on the server:
```
cd ~/TOS && git pull origin master
```
verify with `grep`/`ls`, then `ps aux | grep node` → `kill -9 <PID>` → cPanel **Setup Node.js App → Start** (the Restart button is unreliable). Then a hard refresh (Ctrl+Shift+R).

- **Service worker cache:** `service-worker.js` `CACHE_NAME` has been bumped on nearly every build (currently **v17**) so changes reach browsers on one refresh. The spec sheets often say "don't bump SW"; that heuristic is wrong here because app JS is cached by stale-while-revalidate — bump it (and mention the deviation). `index.html` and `service-worker.js` are served `no-cache`.
- **Env vars** (cPanel → Setup Node.js App → Environment Variables): `BASE_PATH=/TOS` (required), `REGISTRATION_MODE` (invite|open), `SESSION_EXPIRY` (ms), `MAIL_FROM`, `MAIL_ENABLED`, `SENDMAIL_PATH`. The old `AUTH_USER`/`AUTH_PASS*` Basic-Auth vars are now **unused** (dead code `getAuthenticatedUser`/`requireAuth` remain but nothing calls them) — can be left or removed.
- **`data/auth/`** is created automatically on first registration and is **gitignored** — it lives only on the server. If accounts get into a bad state, those JSON files are hand-editable; worst case, deleting `data/auth/` resets all accounts (trip *data* is untouched — the next registrant re-claims the trips).

---

## 9. Known issues / caveats / things to verify

- **Invite email delivery is UNVERIFIED** live (couldn't test from the sandbox). Set `MAIL_FROM`, send a test invite, check spam, and check server logs. The copy-link fallback works regardless.
- **Node 10 on the server.** Fine for `server.js` (built-ins, no optional-chaining in server code). It's why native deps (bcrypt/better-sqlite3) were rejected. If anyone ever wants those, a Node upgrade in the cPanel selector (and possibly a different host) is a prerequisite — recommend against it; the zero-dep approach works today.
- **`manifest.webmanifest` used to 401** under Basic Auth; now static is public so it should 200. Verify no console noise.
- **Cosmetic:** over-budget "Remaining" renders as `AUD -$156.75` (minus before the `$`). Trivial to flip to `-AUD $156.75` if wanted.
- **Two-step delete + sharing** were tested server-side (17-assertion isolation/sharing suite) and via render smokes, but the full click-through (Share modal, remove, collaborator login) should be shaken out live — Mick said "work out bugs later."
- **`app/planning-item.js`** remains vestigial dead code. The commented-out `components/*` block in `index.html` is dead. Both harmless.

---

## 10. Testing discipline (how tests were done this session)

The pattern to continue: **write the code, `node -c` syntax-check, then test against reality before handing over.** Two workhorses:
- **VM unit harnesses:** load a real module's source with `vm.runInNewContext`, stub the few globals it needs (Project/Currency/Render/document…), and assert on the rendered HTML strings / pure-function outputs. For `server.js` internals, load it with `http.createServer` stubbed to `{listen(){}}` and a `require` shim so it doesn't actually listen.
- **Real-server integration harnesses:** `child_process.spawn` the real `server.js` with test env, drive it with Node's `http` client (curl is blocked in the sandbox), assert on responses/on-disk files, and **clean up** (`data/auth`, test trip folders) in a `finally` so the repo is left pristine. This is how auth/isolation/sharing were verified.
- **Browser pane** (`mcp__Claude_Browser__*`) for real-DOM checks: rendered the planner snapshot, budget tiers, currency calculator, and card layouts against a small HTML harness that loads the real module files. Note: screenshots need the pane displayed; `javascript_tool` is reliable for reading state.

---

## 11. Environment notes for the next AI (IMPORTANT — your sandbox may differ)

This session ran on **Mick's Windows machine** (win32), with tools that behave differently from the original handover's Linux sandbox:
- **Shell:** PowerShell primary, but a **Git Bash** (`Bash` tool) is available and was used for all the Node test harnesses (POSIX syntax). `cd` in compound commands can prompt — prefer absolute paths.
- **`curl` is BLOCKED** in the sandbox (permission denied) — use Node's `http` module as the HTTP client in tests.
- **This environment HAS internet egress** (unlike the original Linux sandbox) — real external API calls (Frankfurter, etc.) work here. But `Date.now()`/`Math.random()` are fine; `process.exit()` right after a `fetch` can trigger a harmless libuv teardown assertion.
- **Background processes don't persist across separate tool calls** — start a server and test it within one command, or spawn it inside a single Node harness that also kills it.
- **Node in the sandbox is v24**; the SERVER is Node 10 — don't use syntax in `server.js` that Node 10 can't parse (server.js is deliberately plain).
- **Scratchpad** for temp files. Delete any `_*.html` harnesses written into the repo folder after use (they were cleaned up).
- **Memory:** there's a persistent memory file at `…/memory/compass-tos-project.md` (+ `compass-tos-user.md`) summarizing all of this — keep it updated.

---

## 12. Pending / suggested next tasks

- **Verify invite email delivery live** (set `MAIL_FROM`, test, check spam/logs).
- **Shake out Build 47** with the family (register → own trips; share a trip read-only vs read-write; remove; two-step delete).
- Optional polish: `-AUD $x` over-budget formatting; `manifest.webmanifest` 401 recheck; remove dead Basic-Auth code + `AUTH_USER` env vars once accounts are proven.
- Not requested but worth offering: password reset (there's no reset flow — a lost password currently means editing `data/auth/users.json` or re-registering), "pending invitations" acceptance flow (currently auto-accept), and per-trip "leave" for collaborators.

---

## 13. How Mick works (preserve this)

Technically capable but not a professional developer; operates cPanel/Git/terminal competently **with clear numbered steps**. Wants to be told plainly when something is a bug vs a deployment issue vs a misunderstanding — no vague reassurance. Expects real testing before being told something works. Wants family-friendly, low-friction access. Deployment steps should always end in the kill-PID-then-Start cycle. Deliver complete files, not diffs. His email is mick.henderson@waveconn.com; the app's sending domain is deploytelco.com.au.

**End of Handover #2.**
