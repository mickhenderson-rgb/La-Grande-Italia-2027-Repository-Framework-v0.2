# COMPASS-TOS — Open Backlog

Known bugs and gaps, with enough detail to act on without re-deriving them.

Distinct from `future-roadmap.md`, which holds features deliberately
deferred to a later version. This file is things that are wrong, missing,
or unverified **now**.

Last reviewed: 2026-08-28 (v1.17.0).

Status key: **OPEN** · **IN PROGRESS** · **DONE** (kept briefly for context, then deleted)

---

## A. Priority queue

The agreed order of work, as at 2026-08-28.

| # | Item | Status |
|---|---|---|
| A1 | Journal unsaved-changes guard (§B2) | DONE — v1.11.4 |
| A2 | Repair the dead test suites (§B1) | DONE — 62/62 passing |
| A3 | Shared money/date/place formatters (§C4, C5, D7) | DONE — v1.12.0 |
| A4 | Header wrap (§C1), "1 item(s)" (§C3) | DONE — v1.12.0 |
| A5 | Transit nights (§D8) + countdown destination (§C2) | DONE — v1.13.0 |
| A6 | Multi-day bookings quietened (§D10) | DONE — v1.13.1 |
| A7 | Readiness button labels (§C6), button styles (§D11), scroll affordance (§D12) | DONE — v1.13.2 |
| A8 | Weather: fetch seasonal data + sunrise/sunset (§D9) | DONE — v1.14.0 |
| A9 | Audit the journal export (§B4) | DONE — v1.14.1 |
| A11 | Photo book + web story exports (§B4) | OPEN — net-new builds, not repairs |
| A10 | Tonight flow — the end-of-day journal (§B3) | DONE — v1.16.0 |

Decisions taken 2026-08-28, recorded so they aren't re-litigated:

- **Money**: thousands separators and two decimals everywhere.
- **Dates**: short form with an ordinal, no year — `Fri 27th Aug`.
- **Places**: title-cased on display, whatever was typed or imported.
- **Flight titles**: route only while Research/Shortlisted; airline and
  number added once Selected or beyond.
- **Countdown**: first stay of 2+ nights past the origin, else the last
  flight leg's destination, else where you end up. The "country with the
  most time" rule could not be built — no country is stored anywhere.
- **Multi-day bookings**: full card on the first and last day, one line
  between.
- **Transit nights**: an explicit flag, never inferred from free text.
- **`ux_review_test`**: kept as the standing test account until v2.0.0.
- **Weather**: climate normals from Open-Meteo's ARCHIVE (observed ERA5),
  averaged over ten years. NOT the Climate API - that returns CMIP6 model
  projections and its own docs call it unsuitable for typical-weather-on-a-
  date. Not Visual Crossing either: needs a key, and its documented
  endpoint retires 31 Dec 2026.

---

## B. Structural gaps

### B1. Test suites — ALL GREEN (2026-08-28)

`run-all.js` reports **62/62**. It has never been clean before.

Not one of the eleven final failures was an application bug. Every one
was a suite that had fallen behind a deliberate change, which is worth
recording because the same shapes will recur:

**Fixture passwords too short (2 suites).** `"hunter2"` is 7 characters;
the policy requires 10. Registration failed silently, so every later
request answered 401 and the diagnostics pointed at the wrong thing
entirely. Five suites had been fixed for this earlier and these two were
missed.

**No session at all (2 suites).** `test-editday` and `test-itinerary`
predate the security work and called the API unauthenticated. Both now
register the first user - which the server permits while it has none -
and carry the cookie.

**Looking in the old place (1 suite).** `test-auth` read `users.json`
from `data/auth`, which is exactly where it must no longer be: that
directory was moved outside the served root because the static file
server was handing it to anyone who asked.

**A correct 401 read as a failure (1 suite).** `test-redirect` expected
`/TOS/api/whoami` to return 200. It returns 401, correctly. The
assertion now checks for 401 rather than 404 - which proves *more* than
the original did, because it distinguishes "routed correctly under the
prefix, then refused" from "the prefix broke routing", and routing is
the thing that suite exists to test.

**Exiting while handles were closing (1 suite).** `test-currency` passed
every assertion and then aborted with a libuv assertion and exit code
127, because `process.exit()` fired while the socket from its live
Frankfurter call was mid-close. `process.exitCode` lets Node leave
cleanly. Worth remembering: it presented as "no diagnostic".

**Testing an API that no longer exists (2 suites).**
`test-diagnose-accom` interrogated `Planner.matchByDestination`, removed
on purpose because filtering on destination text hid bookings whose real
town differed from the day's label. Rewritten as a regression guard on
that decision. `test-budget` described the pre-Build-45 Budget in almost
every assertion - including asserting the nights off-by-one that was
overcharging every stay. Retired in place rather than deleted, now
guarding that the old API stays gone; `test-budget-tiers` is its
successor and already covers the current design.

**A fixture that bypassed the code under test (1 suite).** `test-dates`
hand-built `{ day: 1, departure: {} }` and expected a pre-filled date.
The app builds a new flight through `blankItem()` → `blankLeg(day)`,
which is what does the pre-filling, and renders from the `editingLegs`
working copy. The pre-fill was never broken; the test simply never
exercised it. This was the one Mick shelved as "not sure" - the answer
is that nothing regressed.

**Assuming a server that was never started (1 suite).**
`test-delete-project-live` expected something already listening on 8080,
so on every automated run it failed with ECONNREFUSED and tested
nothing. It now starts its own, like the rest.

**The recurring lesson**, across this repair and the earlier one:
*stubbing a module the suite actually exercises is the wrong repair* -
it makes the suite assert against the stub. A stub returning a
plausible-but-wrong value is worse than a missing global, because the
suite still runs and lies. Load the real module; stub only what is
genuinely irrelevant.

**Why it mattered:** working suites caught five real regressions during
these sessions - a duplicate object key that made a method dead code, a
CSS rule scoped so it missed Budget, a `flatMap` that only failed on the
production Node version, a `FormGuard` change that broke an existing
guard test, and flight titles that had silently lost the airline and
number. The dead suites were holes in exactly that net.

### B2. Journal unsaved-changes guard — DONE (v1.11.4)

Looking at this properly turned up something worse than a missing guard.
Every live-saving action (add checklist item, tick one, add or remove a
photo) called `openDay()`, which rebuilds the notes textarea from **stored**
data — so typing notes and then ticking a checkbox **silently destroyed the
notes**. No prompt, no warning.

Fixed with a `Journal.draft` that carries the typed entry across the page's
own re-renders, plus `data-guard-fields` on `FormGuard` so only the fields
`save()` writes count as unsaved work — the live-saving widgets don't
trigger it.

### B3. End-of-day journal flow — DONE (v1.16.0)

The mobile design handoff called this "the one genuinely new flow, and the
reason to build the app at all". Built as the **Tonight** tab: present only
when a journey day is actually today, editing the SAME entry Entries does.

Three parts of the design were deliberately NOT built, each because it
would only half-work, and there are tests asserting their absence:

- **"You took 47 photos today"** - a browser cannot see the camera roll.
  Replaced by a multi-select picker, which is honest about what it knows.
- **Dictation** - every phone keyboard already has a mic key. The Web
  Speech API would only add Android-Chrome support for something everyone
  already has.
- **Photos pre-selected by time and place** - needs EXIF GPS, which iOS
  strips unless permission is granted per-picker. It would work some days
  and silently not others.

### B4. Journal export — AUDITED (v1.14.1)

**This entry was wrong, and is corrected here.** It claimed the module
"promises four formats - photo book, film, web story, archive". It does
not, and never did. Those four come from the *design handoff*, which was
describing intent; they were written into this backlog as though the code
claimed them. A grep finds no trace of any of the four.

What exists is ONE export, and the module says so plainly in its own
header: a single self-contained HTML file, with switches for notes,
checklists and photos. Nobody had ever verified it. It now is - 19
assertions covering the document, the day sections, escaping, and the
photo path.

**It works, and it is better than expected.** Uploaded photos really are
inlined as base64, so the file survives being emailed; remote photos
degrade to a link rather than breaking the export; and it already carries
a print stylesheet with `page-break-inside: avoid`.

**That last point matters for A11.** Print-to-PDF from this export is most
of a photo book already. The cheap path is a print-tuned variant of what
exists, not a PDF generator. A web story is a genuinely separate build.

One real bug found while auditing and fixed: the status line said
"3 day(s), 7 photo(s)".

Two faults in the AUDIT itself, both worth remembering because both
looked like app bugs:

- The fixture used `/data/projects/...` with a leading slash. Real uploads
  have none (server.js writes `data/projects/...`), so the export
  correctly treated it as a remote URL and the test wrongly read that as
  a failure to embed.
- The `FileReader` stub fired `onloadend`; `toBase64` resolves on
  `onload`. The promise never settled, the suite hung after printing half
  its results, and it looked like truncated output rather than a deadlock.

### B5. Nothing verified in a real browser at phone width — PARTLY ADDRESSED

Every mobile change has been reasoned from the CSS and verified by string
assertions. That catches a wrong selector (it caught the Budget table one)
but cannot catch "this looks wrong". Mick's phone screenshots of 2026-08-27
substantially closed this — they found six real bugs — so the practice to
keep is **screenshots after each mobile change**, not a one-off browser
pass.

---

## C. Confirmed bugs (verified in code)

### C1. Header breaks with a long trip name — DONE

`.app-header` is `display: flex; justify-content: space-between`, but there
is **no `.app-actions` rule** — `components.css:245` styles the buttons and
never the container. With no `flex: none`, the actions block is squeezed
until its buttons wrap onto two lines, overlapping the hero.

Reproduces with "TEST - Australian Road Trip"; "Italy 2027" is short enough
to fit. Fix: `flex: none` (and likely `white-space: nowrap`) on
`.app-actions`, plus `min-width: 0` on `.app-title` so the ellipsis works.

### C2. "355 days until Sydney" — counting down to the origin — DONE

`dashboard.js:116` uses `days[0].location`, which is day 1's location — the
city you leave FROM, not a destination. An Italy trip counts down to Sydney.

Options: say "days until departure", or use the first overnight that differs
from the origin.

### C3. "1 item(s)" — DONE

`day.js:90` and `day.js:110` ("1 photo(s), 0 checklist item(s)"), plus a
delete confirmation at `planner.js:834`.

### C4. Money formats differently per screen — DONE

Budget shows `AUD 3,611` (thousands separator, no decimals); the day view
shows `AUD 3611.15` (decimals, no separator) for the same car rental.

Worth a shared formatter rather than patching each screen.

### C5. Dates format differently per screen — DONE

Three formats in use: planner day cards print raw ISO `2027-08-27`
(`planner.js:99` renders `day.date` unformatted), the dashboard shows
`Sun, 23 Aug 2026`, the map rail shows `7–9 Sep`.

`dates.js` has `addDays` / `getDayDate` / `findArrivalDate` /
`recalculateJourney` but **no display formatter** — that's the gap.

### C6. Readiness button labels inconsistent — DONE (v1.13.2)

Blocking findings say "Open day"; cost findings say "Open". Introduced in
v1.11.0.

---

### C7. Two dashed map lines that meant different things looked identical — DONE (v1.16.3)

Reported as "the dotted flight line ends in Le Noirmont, not Milan". It
did not. The flight line ended in Milan; a SECOND line — "we expected a
road here and could not find one" — carried on to Le Noirmont, and the
two composited over map tiles to `#adb4b2` and `#b0b5b8`. Three channels
apart, so they read as one continuous line ending in the wrong city.

The no-route line is now `--color-danger` red: it is a problem to fix, not
a way of travelling, so it no longer looks like one. Guarded by
`test-route-lines.js`, which composites every pair of line styles against
the tile colour and fails below a distance of 60. The old pair measured 7.

### C8. A flight claimed any leg that shared a day with it — DONE (v1.16.3)

`legModeKey` asked only whether a flight OVERLAPPED the gap between two
stops, never where it went. Land in Milan on day 3 and drive on to Le
Noirmont the same day, and the arrival flight marked the DRIVE as flown —
no road ever requested, the leg drawn as a dashed hop.

`flightServesLeg` now rules a flight out only when it demonstrably belongs
elsewhere: it names a destination, that destination is not this stop, and
it IS another stop on the trip. A flight recorded to "Malpensa" still
claims a stop called "milan", because nothing better wants it.

Latent on the Italy trip rather than active — worth fixing before it is not.

### C9. Milan → Le Noirmont has no road route — OPEN

Both are ordinary drivable places, so this is almost certainly a bad
coordinate rather than a genuine absence of road: Geoapify cannot snap a
waypoint that sits off the network, which is the same failure the
Dolomites centroid caused in v1.10.0. "le noirmont" is a plausible
mis-geocode — there is a village in the Swiss Jura and a summit of nearly
the same name.

Not diagnosable from here: the trip data lives server-side only and the
local `data/projects/` copy is stale (9 days, Rome→Bologna). Needs either
the stored coordinates for those two stops, or a drag of the pins on the
map to see whether the route appears.

The route summary now says which pins to check rather than only naming
the leg.

### C10. Flights had no idea which airport they meant — DONE (v1.17.0)

A leg from/to was free text. "Milan" does not say MXP or LIN, and a trip
through Singapore could mean any of four fields. Legs now hold an IATA
CODE picked from a bundled list of 4,007 airports (ourairports.com,
public domain, filtered to a real 3-letter code plus scheduled service).

Two searches, because one is not enough. TEXT finds what you can name.
PROXIMITY finds what you cannot: typing "Milan" can never surface BGY,
whose name commemorates a painter and whose town is Orio al Serio — yet
it is where a great many people land for Milan. near() offers all three.

Free text still saves, and every leg written before this keeps working
untouched — Airports.label() returns an unknown value unchanged rather
than blanking it.

Guarded by `test-airports.js` (ranking against the real dataset, including
the two ranking bugs found while building it) and `test-airports-served.js`,
which asks a real server for the file — server.js serves static assets
from an allowlist, so a new asset directory is unreachable by default.

### C11. departure.location / arrival.location are now redundant — OPEN

A leg carries from/to AND departure.location/arrival.location, which
overlapped even as free text. Now that from/to name a specific airport,
the location fields have no distinct job left.

Not removed yet: existing trips have data in them, and deleting a field
is a migration rather than an edit. Decide whether to drop them, or keep
them for the terminal ("T1", "Concourse D"), which is the only thing they
could usefully say that a code cannot.

### C12. Old flights still hold free text — OPEN (housekeeping, not a bug)

Legs saved before v1.17.0 keep phrases like "Sydney Airport". They
display and match exactly as before, but they do not carry a code, so the
map falls back to matching them by name. Reopening a flight and re-picking
each airport from the list upgrades it. Nothing breaks if that never
happens.

## D. Data-model and design questions

### D7. Day titles render lowercase next to title-cased locations — DONE

A day card heading reads "vigano san martino → mezzana" directly above
"📍 Vigano San Martino". The heading is `day.title` (user data, imported
lowercase); the line below is title-cased by `pretty()`.

Not our bug, but we could title-case titles on display. Same origin as
**"palermo → palermo"** and **"mezzana → mezzana"** — the importer generates
a from→to title even where you stay put in one place.

### D8. No way to mark a night as "in transit" — DONE (v1.13.0)

The app treats `overnight === "flight"` as a transit night. Nothing else
qualifies. So a night on a ferry, recorded as "ferry from naples", can only
ever be an unplottable location — the map flags it `NO LOCATION` and the
Readiness screen will count it as a night with nowhere to sleep.

This is a genuine gap in the model, not a display problem. Needs a proper
transit concept (a flag on the day, or a reserved set of values).

### D9. Weather shows the useless half for a distant trip — DONE (v1.14.0)

Italy 2027 is ~355 days out and the destination page shows a live 3-day
forecast for *next week*, while "Seasonal Average" says no data saved. For a
trip that far out, seasonal is the only useful one and it's empty.

Separately, Canberra shows neither — probably a destination with no
coordinates. Confirm now that days are editable on mobile (v1.11.3).

### D10. A multi-day booking appears on every day it spans — DONE (v1.13.1)

A 21-day car rental renders on all 21 day cards. Defensible — you do have
the car — but it crowds out what's actually happening that day. Consider a
quieter treatment for a booking that merely spans a day versus one that
starts or ends on it.

### D11. Three button styles in one row — DONE (v1.13.2)

On a transport card: "Booking Site" as gold underlined text, "Open Details"
as a grey button, "Delete" as a red outline. The card title is also
underlined in gold, which makes it read as a link.

### D12. Horizontally scrolling rows have no affordance — DONE (v1.13.2)

The day's quick-links row scrolls sideways with `scrollbar-width: none`, so
"Accommodation" is cut to "Ac…" with nothing indicating the row moves.
Putting Edit Day first (v1.11.3) fixed the worst case; the general problem
stands. Same pattern is used for `.hero .quick-links` throughout.

---

## D2. Deferred to V2

### V2-1. Lossless photo storage — OPEN

Photos are stored as two derived JPEGs: a 1600px display copy and a 3200px
archive copy (v1.15.0). Neither is the original. 3200px is ~300 DPI across
a 270mm page, so it covers any single page in a photo book with room to
crop, but a full-bleed double-page spread wants nearer 4700px, and nothing
here is lossless.

Doing better means real storage - object storage with a lifecycle policy,
not a shared cPanel disk - which is a V2 conversation, not a V1 one.
Raised by Mick 2026-08-28.

Note the irreversibility: a photo is downsized in the browser before it
ever leaves the phone, so raising the cap later does nothing for photos
already added. That is why the cap went up before the Italy journal gets
filled in rather than after.

---

## E. Housekeeping

- **`ux_review_test` account** — created during a UX review, still in
  `~/compass-tos-auth/users.json`. It owns
  `test-australian-road-trip-in-progress`, shared to Mick_H with write.
  No ownership-transfer endpoint exists. Mick is keeping the trip for
  testing, so the account stays for now.
- **Password rotation** — passwords were exposed before the auth directory
  was moved out of the served root. A change-password UI now exists in
  Settings; Mick's own password still wants rotating.
