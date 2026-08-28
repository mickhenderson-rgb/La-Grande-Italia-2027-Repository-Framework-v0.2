# COMPASS-TOS — Open Backlog

Known bugs and gaps, with enough detail to act on without re-deriving them.

Distinct from `future-roadmap.md`, which holds features deliberately
deferred to a later version. This file is things that are wrong, missing,
or unverified **now**.

Last reviewed: 2026-08-28 (v1.13.1).

Status key: **OPEN** · **IN PROGRESS** · **DONE** (kept briefly for context, then deleted)

---

## A. Priority queue

The agreed order of work, as at 2026-08-28.

| # | Item | Status |
|---|---|---|
| A1 | Journal unsaved-changes guard (§B2) | DONE — v1.11.4 |
| A2 | Repair the dead test suites (§B1) | PARTLY DONE — 46/57 passing, 11 remain |
| A3 | Shared money/date/place formatters (§C4, C5, D7) | DONE — v1.12.0 |
| A4 | Header wrap (§C1), "1 item(s)" (§C3) | DONE — v1.12.0 |
| A5 | Transit nights (§D8) + countdown destination (§C2) | DONE — v1.13.0 |
| A6 | Multi-day bookings quietened (§D10) | DONE — v1.13.1 |
| A7 | Readiness button labels (§C6), button styles (§D11), scroll affordance (§D12) | OPEN — next |
| A8 | Weather: fetch seasonal data + sunrise/sunset (§D9) | OPEN |
| A9 | Verify journal export: photo book, then web story (§B4) | OPEN |
| A10 | End-of-day journal flow (§B3) | OPEN — workshop first |

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

---

## B. Structural gaps

### B1. Dead test suites — PARTLY REPAIRED (11 remain)

`run-all.js` reports **46/57 passing** (was 33/52). Nine suites repaired
across 2026-08-27/28.

**Repaired:** `test-day-reference`, `test-form-delete`, `test-mail`,
`test-mail-confirm`, `test-maplinks`, `test-snapshot`, `test-trip-export`,
`test-ux-review-fixes`.

`test-snapshot` was the one that mattered: it flagged a **real regression**
(flight titles had lost the airline and number — fixed in v1.11.5) *and* a
bug in the repair itself. A stub of `Transport.matchesDay` returning
`false` silently removed the entire transport section from the snapshot, so
an assertion about transport titles failed for a reason that had nothing to
do with transport. Stubs that return plausible-but-wrong values are worse
than missing globals, because the suite still runs.

**The lesson from doing it:** the rot was almost entirely sandboxes that had
fallen behind the app — a module grew a reference to `DayReference`,
`Phase`, `Transport`, `Flights` or `setInterval` and the mock was never
told. But **stubbing a module the suite actually exercises is the wrong
repair** — it makes the suite assert against the stub. `test-day-reference`
was stubbing the very module it exists to test; `test-snapshot` and
`test-trip-export` needed the real `MapLinks`/`Flights` loaded. Load the
real module; stub only what's genuinely irrelevant.

**Still failing, and why each needs a judgement call rather than a patch:**

| Suite | Symptom | The question to answer |
|---|---|---|
| `test-diagnose-accom` | `Planner.matchByDestination is not a function` | Confirm the replacement is `matchByDayRange` and that the suite's intent still holds. |
| `test-dates` | "new flight: departure pre-fills day 1" | Date pre-fill behaviour may have changed with multi-leg flights. |
| `test-budget` | `all.find is not a function` | Something the suite expects to be an array no longer is. |
| `test-accom-multiday`, `test-hire-car-server`, `test-editday`, `test-itinerary`, `test-redirect`, `test-auth`, `test-currency`, `test-delete-project-live` | HTTP assertions / ECONNREFUSED | These spawn or expect a server on :8080. Check for port collisions when run in sequence, whether they need `GEOAPIFY_KEY`, and whether the out-of-root auth dir is prepared. |

**Do not** mass-update assertions to match current output. That converts a
test into a change-detector that asserts nothing — and at least one of these
(the flight title) may be flagging a genuine regression.

**Why it matters:** working suites have caught four real regressions in
recent sessions — a duplicate object key that made a method dead code, a CSS
rule scoped so it missed Budget, a `flatMap` that only failed on the
production Node version, and a `FormGuard` change that broke an existing
guard test. Every dead suite is a hole in that net.

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

### B3. The end-of-day journal flow doesn't exist — OPEN

The mobile design handoff calls this "the one genuinely new flow, and the
reason to build the app at all": on the evening of a travel day the journal
opens on **Tonight** — "you took 47 photos today", a 3-column grid with
three pre-selected by time and place, a free-text field with dictation, an
optional toggle attaching the day's expenses, and a save that names the next
day. Currently the journal is a plain entry form.

Largest gap between what's built and what was designed.

### B4. `journal-export.js` promises four formats — OPEN

Photo book, film, web story, archive. Unverified which actually work.
Confirm before anyone relies on one.

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

### C6. Readiness button labels inconsistent — OPEN

Blocking findings say "Open day"; cost findings say "Open". Introduced in
v1.11.0.

---

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

### D9. Weather shows the useless half for a distant trip — OPEN

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

### D11. Three button styles in one row — OPEN

On a transport card: "Booking Site" as gold underlined text, "Open Details"
as a grey button, "Delete" as a red outline. The card title is also
underlined in gold, which makes it read as a link.

### D12. Horizontally scrolling rows have no affordance — OPEN

The day's quick-links row scrolls sideways with `scrollbar-width: none`, so
"Accommodation" is cut to "Ac…" with nothing indicating the row moves.
Putting Edit Day first (v1.11.3) fixed the worst case; the general problem
stands. Same pattern is used for `.hero .quick-links` throughout.

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
