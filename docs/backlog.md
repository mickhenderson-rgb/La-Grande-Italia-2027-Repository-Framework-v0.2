# COMPASS-TOS — Open Backlog

Known bugs and gaps, with enough detail to act on without re-deriving them.

Distinct from `future-roadmap.md`, which holds features deliberately
deferred to a later version. This file is things that are wrong, missing,
or unverified **now**.

Last reviewed: 2026-08-31 (v1.39.2).

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
| A11 | Photo book (§B4) | DONE — v1.18.0 |
| A12 | Web story (§B4) | DONE — v1.24.0 |
| A13 | Export for production, zip (§B4) | DONE — v1.19.0 |
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

### C9. Milan → Le Noirmont had no road route — DONE (v1.17.4)

**The earlier entry here was wrong.** It recorded this as a mis-placed pin
that Mick re-placed. He did not: *"I didn't re-pin Le Noirmont, it fixed
itself."*

Which ruled out the diagnosis and pointed at the real bug. `Geo.routeLeg`
caught **every** error except a missing API key, cached a null and returned
it. So a rate limit, a timeout and a road that genuinely does not exist
were indistinguishable, and all three were reported as:

> No road route found for: Milan → Le Noirmont — check the pins on this
> leg, one of them is probably not on a road

against a pin that was correct all along — Le Noirmont has been in
`cityCoords` at [47.2306, 6.9628] the whole time. The failure was cached
for the session, so it persisted until a reload and then "fixed itself",
which is exactly what a swallowed transient failure looks like.

The distinction already existed everywhere else. `routeLeg` was the one
place that threw it away:

| Upstream | Server | `route()` | Means |
|---|---|---|---|
| 200, no features | `{route: null}` | returns `null` | no road exists |
| 4xx (not 429) | `{route: null}` | returns `null` | no road exists |
| 429, 5xx | 502 `GEO_UPSTREAM_STATUS` | **throws** | try again |
| unreachable | 502 `GEO_UPSTREAM_UNREACHABLE` | **throws** | try again |

`routeLeg` now returns null only for a real answer, retries a transient
failure once, and throws if it still fails. Failures are no longer cached,
so the next redraw retries. The map counts them separately and says
"Couldn't reach the routing service for 2 legs — reopen the map to try
again" instead of blaming a pin.

The upstream-4xx mapping is new: a 4xx is an answer about the request, not
a failure, and retrying it forever would be as wrong in the other
direction. Geoapify is not consistent about whether an unroutable pair
comes back as 200-with-no-features or as a 4xx, so both are handled rather
than guessed at — this was **not** verified against the live API, which
needs a key.

Made more urgent by v1.17.3: four concurrent requests instead of one
sequential means more chance of a 429, so this failure was getting *more*
likely, not less.

`test-route-legs.js` had encoded the wrong premise in its own stub — "502
the way Geoapify does for a flight or an unsnappable point". Corrected;
502 now means the service failed, and `test-route-failure-kinds.js` covers
each failure mode separately.

### C10. Flights had no idea which airport they meant — DONE (v1.17.0)

A leg from/to was free text. "Milan" does not say MXP or LIN, and a trip
through Singapore could mean any of four fields. Legs now hold an IATA
CODE picked from a bundled list of 4,008 airports (ourairports.com,
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

### C11. departure.location / arrival.location — DONE (v1.17.1)

Relabelled as **Departure Terminal** / **Arrival Terminal** and stored as
`.terminal`. A terminal is the one thing about where a flight touches
down that an airport code genuinely cannot say; a place was something the
record already knew.

Old `.location` values are still read (`Flights.legTerminal`), because the
few trips carrying anything in there are more likely to have written
"Terminal 3" than a city.

The two dashboard screens that read those fields now take the airport
from the leg instead. The "Locked in" card used to print
`arrival.location` as the destination — blank on almost every trip, so
half the card rendered empty. With the field meaning "T1" it would have
gone from empty to wrong.

Caught on the way: `test-part3-dashboard.js` STUBBED Flights, and the stub
silently lacked `overallFrom` the moment the dashboard started calling it.
The stub is gone and the real module is loaded — the same lesson as the
snapshot suite, relearned.

### C13. The picker called every saved code unrecognised — DONE (v1.17.2)

Found by driving the real form in a real browser, which is the only place
it existed. airportHint() runs on RENDER; the 391 KB list arrives after.
Airports.lookup("SYD") returned null — not because SYD is unknown but
because nothing had been looked up yet — and isCode("SYD") was true, so
every saved flight opened with "Not a code we recognise" under a
perfectly good code.

Nothing is unrecognised until the list is in hand. primeAirports() now
fetches on add()/edit() and fills the hints in when it lands.

### C14. Airport fields were narrower than their neighbours — DONE (v1.17.2)

`.form-field` is a flex column, so an input placed directly in one
stretches to the field width. Wrapping the input in `.geo-input-wrap` — 
needed to position the dropdown — stopped that: the input fell back to its
intrinsic size, ~40px narrower than the airline field beside it, with the
dropdown overhanging its own input by the difference.

`.geo-input-wrap > input { width: 100% }`. Also fixes the day-location
field in the planner, which had the same wrapper and the same problem.

Both are pinned by `test-airport-picker-render.js`, which asserts the
UNLOADED state — every other suite tests the picker after load, which is
exactly why neither showed up.

### C15. The flight legs vanished from the map — DONE (v1.17.3)

Reported as "the flights have disappeared". They had not been
misclassified — they had nowhere to be drawn.

`resolveCoords` placed a stop from `cityCoords`, a hand-kept table of 28
European towns. It has rome, milan, matera, le noirmont. It has no doha
and no sydney, so both stops resolved to null, `plottedStops()` filtered
them out, and the legs between them were never legs at all. The summary
said "13 of 15" and never mentioned the two it had dropped.

A leg carries an IATA code now, so the app knows exactly where DOH is.
New tier 3 in `resolveCoords`: the airport a flight lands at or leaves
from, matched by day overlap. Tiers 1 and 2 (the day's own pin, then the
table) still win, so no existing placement moves.

Caught by the guard while writing it: taking "the last leg's arrival"
put the DOHA stop at MALPENSA, because Sydney → Doha → Milan is ONE
booking and its final arrival is Milan. The stop is now matched by name
against each of the booking's airports first, and only falls back to
order when nothing matches.

### C16. The map took 30–40 seconds to finish drawing — DONE (v1.17.3)

Legs were routed one at a time: thirteen round trips to the routing
service, each waiting for the last, on a phone. Nothing about them is
sequential — no leg's request depends on another leg's answer.

Four at a time now, not thirteen: a routing API is shared and rate
limited, and firing every leg at once is how a trip earns a 429 and comes
back with nothing. Results are collected BY INDEX and tallied afterwards
so the summary still reads in trip order, and each leg is still drawn the
moment it arrives. The progress line now counts ("7 of 15 legs").

### C12. Old flights still hold free text — CLOSED (2026-08-30, Mick)

Legs saved before v1.17.0 keep phrases like "Sydney Airport". They
display and match exactly as before, but they do not carry a code, so the
map falls back to matching them by name. Reopening a flight and re-picking
each airport from the list upgrades it. Nothing breaks if that never
happens.

Closed 2026-08-30: Mick reports the flights were re-picked with IATA codes
and the flight data completed. NOT verified from here - the repo copy of
data/projects is a week stale (flights.json dated 23 Aug, before the
airport picker shipped on the 27th), so it shows the old free text and can
say nothing about the live server. The known data/projects drift.

### C17. The stop label was unreadable in dark mode — DONE (v1.17.5)

`.tm-plabel` had a **hard-coded white** background and a **themed** text
colour. Light mode: `#2C3E50` on white, 10.98:1, fine. Dark mode:
`--color-text` becomes `#e8eaed`, so it was `#e8eaed` on `#ffffff` —

**1.21:1**, against the 4.5:1 body text needs.

A category error rather than a typo. Pins and labels are drawn **on map
tiles**, and the tiles are the same light beige whichever theme the app is
in. So they must follow the MAP, not the app. Half-following the theme is
the worst of both, and that is what shipped.

The same slip left the Booked pin glyph at 2.77:1 on its own themed
background. Both are now fixed literals from the light palette, written
out rather than referenced, because not moving with the theme is the
point.

This collided with a rule from v1.11.3 — "no surface in the map panel is
still hard-coded white" — which is right about panel chrome (rail, cards,
buttons sit on the app surface) and wrong about anything drawn on tiles.
The on-tile elements are now exempted **by name**, with a companion
assertion that they are ENTIRELY literal, so the exemption stays a
decision rather than a loophole. Same treatment the status badge hues
already had.

Guarded by `test-map-ink-contrast.js`, which computes real WCAG ratios
against the tile colour rather than checking for the presence of a token —
so it fails on what a person actually experiences. It fails on the shipped
combination.

**Checked and NOT a bug:** the route legend appeared to be missing "by
air" while the summary said "1 leg by air". Probed directly — the legend
does emit it. A cropped screenshot, not a defect.

### C18. Save Entry said nothing — DONE (v1.18.0)

The confirmation existed. `Project.persist` writes "Saved" into
`#save-status` — but `Journal.save()` fired the save and immediately
re-rendered, and `Layout.render()` rebuilds the sidebar, so that element
was replaced by a fresh "Ready" before the write landed.

The same race swallowed **failures**: a save that never reached the server
looked exactly like one that worked.

`Project.update` now returns its promise and `persist` rethrows after
reporting. The journal awaits it and says so next to the button that
caused it. On failure it deliberately does **not** clear the draft or
re-render — what was typed is the only copy that exists.

### C19. The journal export appeared to hang — DONE (v1.18.0)

Two things, one symptom.

`download()` revoked the object URL in the same tick as `link.click()`.
Browsers start a download asynchronously, so revoking that early cancels
it — silently. The export ran to completion, reported no error, and no
file appeared. Now revoked on a 60s timer.

And the honest half: embedding photos IS slow, and a line of text changing
every few seconds is indistinguishable from a locked page. There is a
progress bar now, weighted (a photo counts 4× a day, because it is the
slow part), the loop yields so the bar paints, the button disables while
it runs, and a failure says so instead of leaving "Embedding photo 41…" on
screen forever.

`--color-success` added to both themes, paired with `--color-danger`,
which was already themed. A green picked for a white card is 2.78:1 on a
dark one.

### A11 (first half). Photo book — DONE (v1.18.0)

`app/photo-book.js`. Lays the journal out as book pages and opens the
print dialog; Save as PDF gives a file a printer can use.

**Not a PDF generator.** The browser has one, this project has no
dependencies by design, and hand-rolling one would be weeks of work to
produce something worse than Ctrl+P. What the browser cannot do alone is
lay a book out, so that is all this does.

Specifications taken from a supplier that publishes them
(photobooks.pro), not guessed: 1/8 in bleed every edge, 3/4 in safe area
inside the trim, 300 DPI preferred, single pages not spreads.

**photobookshop.com.au — which prompted this — does NOT accept general PDF
uploads.** Their support says to email business@photobookshop.com.au for
the dimensions of a custom order. So nothing targets one supplier; the
size list is one object at the top of the module.

**This settles the 3200px question from batch 7.** Archive photos are
3200px on the long edge = 10.67 in at 300 DPI:

| Size | Full-bleed DPI | |
|---|---|---|
| 8 × 8 | 388 | above spec |
| 10 × 10 | 312 | above spec |
| 8.5 × 11 | 284 | slightly under, prints fine |
| A4 | 268 | slightly under, prints fine |
| 12 × 12 | 261 | print smaller |

So **3200px is enough up to about 10 inches.** The DPI is shown on the
size dropdown rather than discovered from the finished book.

Verified in a real browser: at 8 × 8 the page measures 792 × 792 px
(8.25 in at 96 DPI), the safe area insets 84 px (7/8 in = 3/4 safe + 1/8
bleed), a full-bleed photo covers the page exactly, captions sit inside
the safe area, and nothing overflows. Landscape 11 × 8.5 checked too.

Guarded by `test-photo-book.js`, which does arithmetic on inches — print
geometry is the one thing that cannot be checked by looking at it, because
a page 2% too big looks identical on screen and comes back trimmed wrong.

### A11 (second half). Web story — DONE (v1.24.0)

Built as `app/web-story.js`, reached from the photo-book screen. A
vertical, tap-through, phone-first telling of the trip, using the 1600px
DISPLAY copies - the one place the smaller copy is the right one.

This entry said OPEN until 2026-08-30, three weeks after it shipped: the
priority queue had recorded A12 as done and this duplicate was never
updated. Kept rather than deleted, as the reminder that two places
tracking one fact is how a backlog starts lying.

STILL UNVERIFIED: the scrolling has never been checked on a real phone.
Nothing scrolls in the browser pane used for testing - even setting
deck.scrollTop reads back 0 - so this needs a look on an actual handset.

### A13. Export for production (zip) — DONE (v1.19.0)

`app/zip.js` + `app/production-export.js`. Photos as files, writing as
plain text, in trip order, zipped — for dropping into a book app rather
than into a PDF reader.

The photo book decides the layout; every real book-making tool wants to
decide that itself. This is the other half.

**The zip is written by hand, in ~150 lines, because it does not
compress.** A STORED entry is a completely ordinary zip that any OS opens
by double-clicking, and the payload is JPEGs — already compressed, so
deflating again buys about 1% while costing a DEFLATE implementation this
project would own forever.

Ordering is carried entirely by the filenames, zero-padded to four digits
(`0001_day-01_arrive-in-milan.jpg`), because every one of those tools
sorts by name on import and `1, 2, 10` puts 10 between 1 and 2. Each photo
gets a `.txt` sidecar of the same basename; `captions.csv` carries the
same for bulk importers; `journal.txt` is the trip as readable prose.

Verified end to end: built a real archive and opened it with Windows'
own `System.IO.Compression` — correct names, sizes and folders — then
extracted it and confirmed the JPEG magic bytes and text survived intact.
`test-production-export.js` checks the container bytes (local header
signature, EOCD, central-directory offset and size, the UTF-8 filename
flag, sizes in the local header rather than a data descriptor) rather than
trusting them, since a subtly malformed zip opens in one tool and not the
next. CRC-32 is checked against the standard `"123456789"` → `0xCBF43926`.

**Known limit, stated on the page:** the archive is assembled in memory.
A hundred photos at 1.5 MB is 150 MB — fine on a desktop, possibly not on
a phone. The running total is shown as it builds, and an out-of-memory
failure says so rather than dying silently.

### BUG-001 / BUG-002. Native dialogs replaced — DONE (v1.20.0)

`app/ui.js`. **60 `alert()` calls across 13 files and 13 `confirm()` calls
across 10 are gone.**

The review did not just count them, it **proved the failure mode**: its
browser suppresses JS dialogs — as managed corporate browsers, in-app
webviews and every automation tool do — and submitting a form with a
required field blank produced *nothing at all*. No message, no focus
change. The console said "Page dialog suppressed (alert)" and the person
saw a screen that had ignored them.

Three things rather than one, because the 60 were doing three jobs:

| | for | where it appears |
|---|---|---|
| `UI.warn` | you typed something wrong | inline, next to the field, and focus goes back to it |
| `UI.fail` | we tried something and it did not work | a toast — by then the form may be gone |
| `UI.ok` | it worked and the screen does not show it | a toast |

`UI.warn` **falls back to a toast when a form has no message slot**, which
is what made migrating 26 validation call sites safe before any form had
one: never worse than what it replaced, better once a slot is added.
`trip-setup` and `settings` have slots now; the rest can be added one at a
time.

`UI.confirm` replaces `confirm()` — callback rather than return value,
since a real dialog cannot block a thread. The six identical `remove(id)`
methods were split into `remove`/`removeConfirmed` rather than having
their fetch chains wrapped in a closure. `itinerary-import` needed a
genuine restructure into `loadItinerary` → `applyItinerary` →
`commitItinerary`, one split per question — and its start-date question
gained an answer it never had: a real **"Keep 2027-08-17"** button, where
`confirm()`'s Cancel read as "abandon the whole import".

`form-guard.js` **keeps** its native `confirm`, asserted as the single
deliberate exception: it also has to run from `beforeunload`, where
nothing else does.

Accessibility, which was the review's other point: `role="alert"` for a
failure and `role="status"` for anything else, `role="dialog"` +
`aria-modal` + `aria-labelledby`, focus opens on the **safe** button,
Escape cancels, Tab is trapped, and focus returns where it came from.

**Verified in a real browser**, since "it can be invisible" was the whole
complaint: the inline warning renders with the danger tokens and returns
focus to the field; the toast is visible at z-index 2000 with a dismiss
button; the dialog covers the page, opens focus on Cancel, and Escape
cancels. At 375px the toast clears the bottom bar by 88px and nothing
scrolls sideways. In dark mode the toast is `#262b31` / `#e8eaed` with the
dark danger border — the thing a native dialog can never do.

`test-no-native-dialogs.js` greps for the CALL rather than any message, so
a new `alert()` written next week fails the day it is written.

Four suites needed deliberate updates: two sandboxes gained `UI`, one had
pinned `confirm("Remove this checklist item?")` by its exact text (intent
unchanged, mechanism changed), and its Cancel case is now expressed as
"the dialog opens and `onConfirm` never fires".

**Still open from the review:** BUG-003 (routing), BUG-004 (mobile
trip-card hierarchy), BUG-005 (Travel Guide), BUG-006 (budget sign, and
the number printed twice), BUG-007 (dead code — `planning-item.js` is
loaded by index.html and never referenced; `components/` is 16 unloaded
files), UX-005 (directory listing — a cPanel setting, not code).

### BUG-005 / A14. The Guide — DONE (v1.21.0)

`app/guide.js`. The "Travel Guide" sidebar entry had rendered *"isn't
built yet — check back in a future update"* since it was added. This is
what it was for, and the placeholder route is deleted rather than left
renamed.

**Not a guide to travelling.** The sidebar has always grouped it under
**App**, beside Settings, rather than under **Plan** with Destinations —
so it was an app-level thing from the start. Renamed to **Guide**.

**Start Here is live, and that is the point.** Static help answers "how
does this work"; it cannot answer *"what do I do now"*, which is the
question someone actually has facing a new trip and fifteen empty
sections. It reads the trip in front of you and reports which of five
steps are done, which is next, and links straight to it — dates → days →
overnight locations → book something → Readiness. Readiness is marked
`always`, so it is never ticked off: it is a habit, not a step.

On a part-finished trip it says things like *"2 of 3 days have one"*
rather than just "incomplete".

The reference half is searchable (every word must match, so two words
narrow rather than widen) and explains what the screens cannot:

- accommodation and transport are keyed to **day numbers**, and Check-out
  Day is the day you **leave**
- an item's status is not decoration — it decides which Budget tier the
  money lands in
- Destinations, Trip Map and Readiness have no Add button because they are
  derived from Planner days

`Guide.hint(topic, label)` returns a **"?"** that opens the guide at the
paragraph explaining a field. Two are placed: Accommodation's Check-out
Day, and Budget's Summary. `test-guide.js` asserts every one points at a
topic that exists — a "?" that scrolls nowhere looks broken.

**A guide that is wrong is worse than none, because it is believed.** So
the suite checks the guide's claims against the code that owns them: the
six statuses come from `flights.js`, the tier mapping from `budget.js`,
the check-out rule is asserted to be the *same sentence* as
`accommodation.js`, and the permission levels come from `sharing.js`. Add
a seventh status and the guide starts lying — and the suite says so.

### C20. `--color-primary` is unreadable as text in dark mode — superseded, see below

Found while checking the guide in a browser. In dark mode
`--color-primary` is `#4a6fa1`, and as **text** on a `#262b31` card that
is **2.77:1** — against the 4.5:1 body text needs.

The same category error as the map pill (C17): a colour that works as a
**background** behind white text does not automatically work **as** text.

`--color-primary-text` added to both themes — `#34495E` light (9.29:1),
`#8bb0de` dark (6.36:1). The guide uses it.

**Still open:** `components.css` uses `color: var(--color-primary)` in
**19 places**. Each needs looking at individually — some are large or bold
enough for the 3:1 threshold, some sit on a different background, and some
are borders rather than text. A blanket swap would be wrong. Worth a pass
with a contrast harness like `test-map-ink-contrast.js`, which measures
rather than greps.

### BUG-004. A Delete looked like a Save — DONE (v1.22.0), and it was app-wide

The review found this on the trip card at 375px and reasonably guessed the
mobile stylesheet was overriding the desktop sizing. It was not — inline
styles beat a media query, so `font-size` and `padding` survived.

What did not survive was everything the inline styles did **not** set. Six
container rules give every button inside them a solid primary fill:

```css
.planner-buttons button {          /* specificity 0,1,1 */
  background: var(--color-primary);
  border: none;                    /* ← also kills the danger outline */
}
```

`.btn-danger` is `(0,1,0)`. The container wins. So **every `.btn-danger` in
the app rendered as a navy pill identical to the Save button beside it** —
Accommodation, Activities, Flights, Restaurants, Transport all put their
Delete inside `.planner-buttons`. Never a mobile problem, and never only
the trip card.

The container rules now say what was always meant: a button gets the
default look **unless it has asked for a specific one**
(`:not(.btn-primary):not(.btn-secondary):not(.btn-danger)`). Sizing rules
are untouched — 44px touch targets should apply to every button.

The trip card also stopped hand-rolling its colours: `background: #34495E`
was the light-theme navy written as a literal, so it stayed light-theme
navy on a dark card.

Verified in a browser at 375px — **Open Trip** navy/white 61px,
**Share/Archive** white with a grey border, **Delete** white with red text
`#b3261e` and a red border. Dark: 5.15 / 6.36 / 6.36 / 5.65, all above 4.5.

### BUG-006. Budget sign and a number printed twice — DONE (v1.22.0)

`Format.money` was **already right** — `toLocaleString` puts the sign next
to the numeral, so `money(-156.75, "AUD")` returns `AUD -156.75`.
`formatConverted` went out of its way to undo it: `Math.abs()` the value,
then prepend its own `-`. The whole bug was the wrapper, so the wrapper is
deleted rather than the formatter changed.

That made `formatConverted` identical to `Budget.money`, so it is gone too
— two names for one behaviour is how v1.16.2's four rival money formatters
happened.

The Remaining row read `-AUD 156.75 ✗ (OVER BUDGET by AUD 156.75)` — the
same figure twice, once negated. The signed number carries it; the verdict
now only names the state.

`test-budget-sign.js` had **pinned the wrong behaviour**, commented "sign
moves in front of currency". Updated deliberately: the deciding argument is
that every other screen shows `AUD -156.75`, and Budget differing is the
exact inconsistency v1.16.2 existed to remove.

### BUG-007. Dead code — DONE (v1.22.0), and it was bigger than reported

The review found `app/planning-item.js` and `components/`. Checking before
deleting turned up the rest: **`assets/js/` — 14 files** that nothing
loads, and which were the *only* thing referencing `components/`. Both
were the pre-`app/` implementation, last touched **5 July** while `app/`
was touched the same day as this cleanup.

31 files, 18 KB, removed. `planning-item.js` was the only one actually
fetched — `index.html` loaded it on every visit and `PlanningItem` is
referenced nowhere. `/components/` also dropped from `server.js`'s
static allowlist.

### C20. `--color-primary` as text — DONE (v1.22.0)

Ten rules set text to `--color-primary`, which is `#4a6fa1` in dark mode:
**2.77:1** on a card, against 4.5:1.

All ten now use `--color-primary-text`. The swap is provably safe because
in light mode the two tokens are **byte-identical** (`#34495E`), so light
cannot regress; dark goes 2.77 → **6.36**.

`border-color` and `background` deliberately still use `--color-primary` —
a border has no text threshold, and a fill behind white text must stay
dark enough for it (it is 5.15:1, which is its real job).

Two more marginal failures fell out of measuring the whole palette:
`--color-muted` was 4.19:1 on a tinted strip and `--color-success` 4.44:1.
Both nudged a shade darker — imperceptible, and now every ink clears 4.5:1
on every surface either theme offers.

`test-theme-contrast.js` measures real WCAG ratios for every ink against
every surface in both themes, rather than checking a token is present. It
exists because this is the **third** time the same category error has been
made — C17's map pill, the Booked pin glyph, and now this: a colour that
works as a background does not automatically work as text.

### BUG-003. Back, Forward and refresh — DONE (v1.23.0)

Every screen lived at the same URL. Back skipped the whole in-app session
and landed wherever the tab had been before it; refreshing dropped you at
the trip list however deep you were; and no section could be bookmarked or
linked to.

**The hash, not the History API's path form.** The app is served from
`/TOS/` on shared LiteSpeed hosting with no rewrite rules, so a real path
like `/TOS/budget` would 404 on refresh — the exact moment this work exists
to fix. A hash never reaches the server.

**The trip is in the URL too.** `#budget` alone cannot survive a reload,
because nothing remembers which trip was open — `Data.loadProject` is
called once, from the trip list, and that is it. So:

```
#                                    the trip list
#/la-grande-italia-2027              that trip's dashboard
#/la-grande-italia-2027/budget       a section
```

which also gives the review what it asked for: a link to "the Budget page
for this trip" that another person can open.

**FormGuard was the awkward part**, exactly as the review predicted. By the
time `popstate` fires the browser has ALREADY moved, so declining to leave
an unsaved form cannot simply not navigate — it has to push the old URL
back. `Router._url` exists for that and nothing else.

Re-navigating to the screen you are already on **replaces** rather than
pushes, or leaving a screen you merely re-rendered would take several
presses of Back. `Landing.open()` clears the URL to `#`, except when Back
is what brought you there — pushing then would undo the press, which is
what `Router._popping` guards.

Degrades rather than throwing: a webview that refuses `pushState` still
navigates, it just forgets.

**Verified in a real browser, not only in the harness:** deep link on load
→ Budget; navigate → Journal → Map; real `history.back()` → Journal →
Budget; `forward()` → Journal. Declining an unsaved-changes prompt on Back
left both the screen AND the address bar on Readiness, and allowing it then
moved. A genuine `location.reload()` on `#/italy-2027/settings` came back
on Settings with the trip loaded from the URL.

**This closes the UX review** apart from two things that are not code:
UX-005 (directory listing — a cPanel setting) and C12 (re-picking airports
on an existing flight, which is trip data).

### C21. The "?" landed on its own row — DONE (v1.24.0)

Reported as *"the ? moves the Check-out day out of alignment"*, and it was
not a spacing problem. `.form-field` is `display: flex; flex-direction:
column`, so a bare button dropped next to the label text became **a flex
item on its own row** between the label and the input — 38px wide, not 18,
and pushing that field 10px below every other field in the grid.

`Guide.label(text, topic, aria)` now wraps the text and the button in one
`.form-label` flex row, so they are a single item on one line. Three
separate container rules were each sizing the "?" like a full button and
all three had to be excluded:

- `padding: 9px 18px` — which under `border-box` **forces** 38px wide
  whatever `width: 18px` says
- `.manager-card button { margin-top: 15px }` — 15px above an 18px circle
  made the label row 33px instead of 23px
- the mobile pill sizing, `12px 18px`

On a phone it grows to **28px** — 18px is under the 24px minimum for a
pointer target — and gives the extra 10px back to the flex line with a
negative margin, so the tap area grows without the row growing.

Measured in a browser at both widths: all three inputs at offset 29,
hint an 18px (28px mobile) circle on the label's own line.

**I got this wrong twice before measuring.** Each fix looked right and
changed nothing, because the next rule down was still winning.

### A12. Web story — DONE (v1.24.0)

`app/web-story.js`. The trip as a vertical, tap-through story — one screen
at a time, the way a phone wants to be read. The third and last export.

**Three exports, three jobs**, and they are not variations on each other:
the journal export is one document read top to bottom; the photo book is
pages for a printer; this is screens for a phone.

**It uses the DISPLAY copy (1600px), not the archive (3200px) the photo
book uses.** No phone shows more than the display copy, and the archive
would roughly double a file that has to be emailed. It is the one place in
the app where the smaller copy is the correct one — and the suite asserts
the two exports have not converged, because if they ever agree one of them
is wrong.

Reads three ways, none of them the only one: scroll (snapping, one screen
at a time, `scroll-snap-stop: always` so a fast swipe cannot skip three),
tap (28% zones left and right, leaving the middle alone so a caption stays
selectable and a photo long-pressable), and arrow keys. Hand-scrolling
moves the progress bars too, via an IntersectionObserver — otherwise they
lie the moment someone swipes instead of tapping.

`100dvh`, not `vh`, because a phone's toolbar hiding changes `vh` mid-read.
Safe-area insets so nothing sits under a notch. A gradient scrim rather
than a flat wash, so the top of each picture is untouched — caption
contrast measured at **10.32:1**.

**Verified in a browser:** 5 slides each exactly one viewport tall, deck
scroll height 4060 = 5 × 812, snapping and snap-align correct, image
covering with `object-fit: cover`, caption 32px from its slide's bottom
over the darkest part of the scrim, tap zones 28% leaving the middle free,
and the navigation JS advancing and retreating the progress correctly on
taps and keys.

**NOT verified: the scrolling itself.** Nothing scrolls in this browser
pane — even a direct `deck.scrollTop = 812` reads back 0 — so
`scrollIntoView` could not be exercised. The geometry it depends on is
proven and the JS around it runs, but the actual movement needs a check on
a real phone.

This closes A11/A12 and the journal export work.

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

### D13. One accommodation option per stay in the Budget — DONE (v1.25.0)

Three hotels shortlisted for the same three nights in Milan added **all
three** to the Budget. Early-planning totals were therefore roughly triple
what the trip would cost, and the tier worst affected was **Estimated** —
the one you look at while deciding.

They are options for one bed. Only one can happen, so only one counts.

**The rule.** Group by destination + check-in day + check-out day, exactly
equal. Within a group, the one **furthest along the workflow** wins;
level pegging goes to the **dearest**.

Furthest-along first, because the moment you prefer one the others stop
being candidates. Dearest as the tie-break, because a budget that guesses
low is the one that hurts.

They stay in Accommodation untouched. This changes what Budget adds up and
nothing else.

**Two things needed more care than the rule itself:**

*Currencies are converted before they are compared.* 200 EUR beats 300 AUD
once converted, but loses on the numerals alone — comparing raw amounts
picks the wrong hotel. Falls back to the raw amount when no rate is known,
which is right often enough: options for one city are almost always priced
in one currency.

*Per-night prices are compared on the total.* 100/night for 3 nights beats
250 flat, though its sticker price is smaller.

**What is deliberately NOT merged**, because dropping a real second
booking loses money silently — far worse than counting an option twice:

- consecutive stays in the same city (Rome days 1–3, then 3–6)
- the same nights in different cities
- **overlapping but unequal windows** (days 1–4 and 2–5) — guessing there
  would be guessing at money
- anything with no destination or no day range, which is not comparable to
  anything

The winner's line says what was left out — *"2 other options for these
nights not counted"* — because a total that quietly disagrees with what
you entered is worse than one that is too big.

**That known edge is now handled.** Two rooms genuinely Booked for the
same nights would have counted as one, the dearer, and the rule cannot
tell that from two competing options both marked Booked by mistake. So
the Budget does not guess and Readiness asks instead - see D14.

### D14. Readiness asks about two bookings for the same nights — DONE (v1.25.1)

The other half of D13. The Budget counts one option per stay, which is
right for options and wrong for two rooms genuinely booked — and it cannot
tell the difference. So the Budget does not guess, and Readiness asks.

> **2 bookings for the same nights in Milan**
> Day 1 to 4 (3 nights): Hotel A, Hotel B. The Budget counts only the
> dearest, on the assumption these are alternatives. If both are real —
> two rooms, say — the budget is short by the other one.

It says what the app **did** about it, not merely that it noticed.
Otherwise the reader has to go and work out for themselves whether the
total is wrong.

**Booked and beyond only** (via the shared `isBooked`, so Travel and
Review count too). Three Shortlisted options for the same nights raise
nothing — that is what shortlisting is.

**The assertion that matters most** is that Readiness and Budget group
**identically**. If Readiness ever grouped more loosely, it would warn
that the total is short about a stay the Budget never merged — a warning
about nothing, which is worse than silence because it gets believed. The
suite runs five cases (same nights, consecutive stays, overlapping-but-
unequal, different cities, no destination) through **both modules** and
asserts they agree case for case.

It is a `money`-level finding, so the existing guest filter hides it —
a guest never sees costs.

### D15. City tax on an accommodation card — DONE (v1.26.0)

Italy charges a *tassa di soggiorno* **per person, per night**. It is
collected at the property, usually in cash, and it is never in the price
you booked at — so a trip with four Italian stays can be a couple of
hundred euro short before anyone notices.

**Two fields, not one.** A per-person rate cannot become money without a
headcount, and **guests belong on the booking** rather than on the trip:
one night might be a twin and the next a family room. Both live on the
accommodation card, which is also where the nights already are.

**Its own line in the Budget**, not folded into the room rate:

> Hotel Milano — city tax · **EUR 30.00**
> EUR 5.00 × 2 people × 3 nights

Folded into the room it would make the room look dearer than the invoice
you can check it against — you pay these separately, and the booking
confirmation will not mention the tax at all.

**Its own currency, defaulting to the room's** — corrected in v1.26.1.
v1.26.0 gave it the room's currency and justified that with "a city tax is
charged in local money, which is the money the room is priced in". **That
is false in the ordinary case**: book a Rome hotel through an Australian
site and the room is priced in AUD while the tax is still EUR cash at the
desk. See D17.

**It rides with the winning option**, so D13's one-per-stay rule still
holds: three shortlisted hotels contribute one room and one tax between
them, not three of each — and it is the *winner's* rate, not the dearest
or the first.

Defaults chosen so an older record under-counts rather than disappearing:
a missing guest count is treated as **one person**, not none. A new card
starts at two guests, which is the common case here.

### D16. City tax has no nightly cap — DONE (v1.33.0)

Rome caps its tourist tax at **10 consecutive nights**, Venice at **5**,
and Florence at **7**. Above the cap you stop paying, and the app would
keep charging.

Not built, because it was not asked for and it needs a third field on a
form that is already long. It only bites on a long stay in one city — most
stops are a few nights — so it is a real gap rather than an urgent one.

If it is wanted, the shape is a `cityTax.maxNights` alongside
`perPersonPerNight`, and `Budget.cityTaxFor` becomes
`rate × guests × Math.min(nights, maxNights || nights)`. The suite already
has the per-night maths isolated in `cityTaxFor`, so it is one function and
one field.

Built exactly to that shape. `Budget.chargeableNights` is the one new
function and `cityTax.maxNights` the one new field.

**Absent or 0 means NO CAP, never "a cap of nothing".** Every
accommodation record written before v1.33.0 has no `maxNights` at all,
and reading a missing field as a cap would zero the city tax on every
existing booking in every trip. Negatives and nonsense are ignored the
same way rather than trusted from a hand-edited file.

**The Budget says it was capped, but only when the cap bites** — a stay
shorter than the cap is an ordinary stay and does not need the arithmetic
explained at it.

**The app does not know each city's number and does not pretend to.** The
form names Rome 10, Florence 7 and Venice 5 as a starting point and says
plainly that every comune sets its own and they change. Same rule the age
prompts follow: say what to check, never invent the figure.

`calculateNights` is untouched and still answers how long the stay is —
length of stay and length of bill are different questions.

New guard: `test-city-tax-cap.js`.

### D17. City tax has its own currency — DONE (v1.26.1)

Mick asked whether the tax needed a currency "so it can add up correctly".
It already had one — the room's — and it already added up correctly,
because Budget groups by `entry.currency` and the tax entry carried one.

**But the reasoning for inheriting it was wrong.** v1.26.0 said "a city tax
is charged in local money, which is the money the room is priced in". The
second half does not follow: booking sites price in your home currency, so
a Rome hotel booked from Australia is AUD while the tax is EUR cash at the
desk. That is the ordinary case, not an exotic one — so the tax was
carrying the wrong currency for most bookings made from home.

Now its own field, **defaulting to the room's** in both the form and the
save, since they do usually match. The field only needs touching when they
do not.

The guard covers the case that motivated it: an AUD room with a EUR tax
produces two entries in two currency buckets, so each converts at its own
rate.

### D18. Copy this trip — DONE (v1.27.0)

For "we have planned this to death, now let us try it a week later, or
through Switzerland instead". The copy starts identical and you edit what
differs, which is far less work than rebuilding a fortnight of research.

`POST /api/projects/:id/copy` with a name. **Copy** sits beside Share on
the trip card and opens a small screen — a screen rather than a dialog,
because a name has to be typed: the id comes from it, so two copies of one
trip need two names.

**What does not come with it, and why:**

| | |
|---|---|
| `expenses.json` | Money actually spent on the real trip. An alternative that has not happened has not cost anything, and carrying it would put fictional spending in **Actual**. |
| `journal.json` | Entries are about the trip that happened. Two copies of one evening is how you end up editing the wrong one. |
| `uploads/` | The journal's photos, which the copy no longer references. Copying them would double the disk for files nothing points at. |
| collaborators | Sharing is a decision per trip. Inheriting it would hand people access to a plan they have never seen. |

**Statuses are kept.** A copy of a trip with a booked flight starts with a
booked flight, because the alternative may well use the same flight — and
resetting to Research would throw away the very research the copy exists
to reuse. The Budget shows real numbers from the first second.

The screen says all of this before you press the button. Finding out later
that the journal did not travel is a bad way to find out, and it is not
guessable from the word "copy".

**Gated on WRITE, not ownership**, and checked *before* the owner-only gate
that guards archive and delete — which would otherwise refuse a
collaborator. A **guest** cannot copy: they are shown the plan without the
costs, and a copy would hand them the costs.

**Node 10, again.** No `fs.cpSync` (Node 16+) and no recursive `rmdir`
(Node 12.10+), so the tree is walked by hand and the failure cleanup reuses
`collectPaths`, the delete handler's own answer to the same problem.

Driven against a **real server** — it creates files, claims ownership, and
must leave nothing behind when it fails, none of which a mocked filesystem
would show. Two of my own assertions were wrong and are worth recording:
a non-existent trip returns **403, not 404** (nobody can edit a trip that
does not exist, and the permission check runs first — which is the better
answer anyway, since it does not tell someone probing ids which trips are
real); and the Node 10 greps matched the comments *explaining* why
`fs.cpSync` is avoided, so they now match the call rather than the name.

### D19. A flight over midnight belonged to one day — DONE (v1.28.0)

Raised by Mick 2026-08-30: *"the day planner is confusing when we have
flights spanning 2 dates"*.

A flight was keyed to exactly one day — `item.day`, the day it **departs**
— and both day views filtered on precisely that (`planner.js` day snapshot
and status dot, `day.js` `liveItemsFor`, `dashboard.js` `liveItems`). So
Sydney → Doha → Milan, leaving day 1 and landing day 3, showed **nothing
whatever** on days 2 and 3: an empty Flights panel, a grey status dot and
a bare timeline, while every fact about the flight sat filed on the day
you left.

Accommodation had solved this in v1.13.1 (D10) with `dayRange` and
`matchByDayRange`. Flights never got the equivalent — and did not need a
new field, because `Dates.recalculateJourney` was **already** reading that
same flight's arrival date to set the next day's date. The app knew the
flight spanned two days; only the day views did not.

Four symptoms, one cause:

1. The day you land showed no flight at all.
2. The **landing time** was on no timeline anywhere — `timedItems` only
   ever pushed `dep.time`, and the landing time is the one fact the rest
   of an arrival day is planned around.
3. The departure day was flagged as a night with nowhere to sleep unless
   you knew to open Edit Day and tick *In transit overnight* yourself.
4. A blank arrival date silently shifted every later day: `findArrivalDate`
   returns null and `recalculateJourney` falls back to *previous + 1* —
   right for a short hop, wrong for anything crossing midnight, and wrong
   without saying so. `FLT-0001` in the live trip had a blank arrival date.

**`Flights.daySpan(item)` — derived, never stored.** The legs already
carry both dates; a `dayRange` field on a flight would be a second copy
that drifts the first time someone edits a leg. `roleOnDay()` then names
each day — `departs` / `airborne` / `arrives` / `same-day` — and
`touchesDay()` is the filter all four read sites now use.

Each day is **labelled**, not just shown: 🛫 *Departs today 21:30 · lands
Day 3*, ✈ *In the air all day · lands Day 3 at 13:05*, 🛬 *Lands today
13:05 · left Day 1*. Three unlabelled copies of the same card would have
been worse than the bug. Same job as the check-in/check-out badge that
makes an accommodation overlap day unambiguous.

Two clamps, both for typos. A span running **backwards** (landing before
take-off) would put `to` before `from` and hide the flight from its own
departure day — strictly worse than the original bug. And a mistyped year
is one keystroke, so the span caps at **two nights**: longer than any
scheduled flight on earth, and uncapped it would paint that flight across
every day of the trip.

**`JourneyEditor.isTransit` now reads three states**, not two: `true`,
`false`, and nobody-has-said. Only the third infers from a flight still in
the air over that night. Saving a day's form always writes an explicit
boolean, so one touch of that checkbox settles it forever — a red-eye you
deliberately kept a room either side of stays your business. `blankDay`
consequently leaves `transit` **absent** rather than `false`; a stored
false would freeze every new day at "no" and no flight could override it.

**The arrival date is now required before Selected.** Research and
Shortlisted are still a shortlist — you are allowed to note a flight
before you know when it lands — but every later day's date comes from
that field, and the message says so rather than reading as a pointless
required field.

New guard: `test-flight-day-span.js`.

**Found while fixing the suites:** `roleOnDay` called with no day number
returned `"airborne"`. `undefined` compares false against *both* bounds,
so it fell straight through to the last branch — every caller with the old
one-argument signature would have been told the flight was mid-air. Now
guarded on `typeof dayNumber !== "number"`.

**Five suites broke, and one of them was right to.**
`test-transit-and-countdown.js` pinned `blankDay(1).transit === false`
with the reason *"an absent field reads as undefined everywhere
downstream"* — sound while `isTransit` had two answers, and exactly wrong
once it had three. Updated with the reasoning recorded. The other four
were stubs that had fallen behind: two got the new members, and two
(`test-snapshot.js`, `test-multileg-planner-dates.js`) load the **real**
`dates.js` instead, since `daySpan`'s whole job is arithmetic through it
and a stub would have tested the stub. The flight-timeline icon also split
— ✈ became 🛫 and 🛬, because a departure and an arrival are now separate
events and one glyph for both makes them look identical.

**Still open:** the Trip Map draws stops from `day.overnight`, so an
inferred transit night now correctly disappears from it — that is the
intent, but it has not been checked against the live trip's map.

---

### D20. Participants — ALL FOUR PHASES DONE (v1.29.0 – v1.32.0)

Raised by Mick 2026-08-30: *"on some days not everyone will do the same
things... 4 people for the first 10 days then have one leave to return
home, or a joinee half way through for 12 days"*. Scoped over two rounds
of questions before any code was written.

**Agreed shape.** `project.participants[]`, each
`{ id, name, dob, dayRange, linkedUser, colour }`. Every bookable item
will gain `participants: [ids]`; an empty list means unassigned, which is
exactly how everything behaves today.

Four decisions, each because the obvious alternative fails later:

- **A participant is not a collaborator.** Sharing invites app USERS and
  is about who can SEE the plan. Being on the trip must never require an
  account. `linkedUser` joins them when the same person is both.
- **Dates, not a flag.** `dayRange` is the shape accommodation,
  activities, transport and (v1.28.0) flights already speak, so a joiner
  needs no new concept.
- **Date of birth, not an age or a band.** Copy This Trip (v1.27.0)
  exists so a plan can be shifted a year; a stored age is wrong in every
  copy. The band derives against that trip's own departure date.
- **Whole trip is `null`, not `[1, lastDay]`.** A stored range silently
  stops covering the end the moment the trip gets longer.

**Bands are real thresholds**, not round numbers: under 2 infant fare;
2–11 child fare; 12+ full adult airfare; **under 25** for the
young-driver surcharge (not 26 — and many suppliers refuse under 21);
70+ where upper limits start, varying by country. Nothing calculates
from a band — the app cannot know a supplier's rates, so from Phase 4 it
flags what to check and you enter the real price.

**Phase 1 shipped (v1.29.0):** the Participants page, names on the trip
setup page, the party-size line on the dashboard, and the route/nav. No
existing number moves — the Budget and Accommodation deliberately do not
read participants yet, and a test asserts it.

**Phase 2 — assignment DONE (v1.30.0).** A "who's going" picker on stays,
activities, restaurants, transport and flights. Empty by default (Mick
chose pick-each-time over assume-everyone), with an **Everyone** button so
the common case stays one tap. Day pages show a split day as two groups.
Transport gains a `seats` field — there is nowhere to record vehicle size
today.

Shipped as designed. Worth recording:

- **The picker sits above Notes in all five modules** — the one place
  every form already shared, so it is in the same spot whatever you are
  editing. Per-module labels: *Who's staying here* / *going* / *eating* /
  *travelling* / *flying*.
- **Everyone means everyone PRESENT**, not everyone on the trip. A Day 14
  booking must not pick up somebody who flew home on Day 10.
- **Somebody not on the trip those days is still listed**, with a note,
  and still selectable. Hiding them makes a booking look impossible to fix
  when the real mistake is the dates; disabling refuses an edit you may be
  about to make legitimate.
- **One edit covers the day card**, not five: `renderSnapItem` is the
  shared row renderer, so the five categories cannot drift apart.
- **`seats: 0` means "does not apply"**, not "a vehicle with no seats" —
  a train ticket has no capacity to run out of.

**A real bug, found by driving two pickers on one page in a browser.**
All three DOM helpers — `pickEveryone`, `pickNobody`, `readPicker` —
used document-wide selectors. Everyone on the first picker silently
ticked boxes in the second, and `readPicker()` returned both pickers' ids
concatenated. The app renders one form at a time so it could not bite
today, but that is luck rather than design, and Phase 3 turns these ids
into money. Scoped two ways: the buttons work from the button that was
pressed, and `readPicker` reads `#pt-picker` on the form being saved.
Greps would never have caught it — it took two pickers on one page.

New guard: `test-participant-assignment.js`.

**Phase 3 — costs DONE (v1.31.0).** The release where numbers move:

- **The live costing bug.** `activities.js` defaults `price.per` to
  `"person"` and the form offers Person/Total, but `budget.js` only ever
  multiplies when `per === "night"`. A €90-per-person tour for four shows
  as **€90, not €360** — wrong on the deployed site today. NOT
  independently fixable: activities carry no headcount at all, so there is
  nothing to multiply by until participants exist. (Offered as a
  standalone patch before that was checked; the offer was wrong.)
- `accommodation.guests` and `restaurants.reservation.partySize`
  auto-fill from assignment, overridable.
- **`chooseOnePerStay` gains a participant dimension.** It groups on
  `destination|dayFrom|dayTo` (D13, v1.25.0), which is exactly the key
  four people in two rooms at one hotel would collide on — the Budget
  would drop a real room and undercount by half. Agreed rule: same place
  and dates with DIFFERENT participants means two bills; the same
  participants still means competing options.

Shipped. Four things worth recording:

**The Ferrari bug is fixed** — a per-person activity price now multiplies.

**The Phase 2 rule had to be restated, not quietly broken.** Phase 2 said
an empty list means unassigned and asserted nothing falls back from empty
to the whole party. That was right while nothing costed anything, and it
cannot survive Phase 3 unchanged: an unassigned per-person price
multiplied by nobody either stays wrong (×1, bug intact) or goes to zero.
So `Budget.headcountFor` is three-way and **never silent**:

| Ticked | Count | The Budget line says |
|---|---|---|
| people | that many | `€90 per person × 4 people` |
| nobody | the party present *that day* | `… (nobody assigned, so the whole party — tick people to change it)` |
| no participants at all | 1 | nothing — exactly the old behaviour |

`Participants.assignedTo` still returns only what was ticked and never
the party. The fallback lives in the Budget, where it is a **pricing**
decision, and it reaches the screen.

**Only NAMED people drive a price** — a trap found by checking the live
trip's data. `la-grande-italia-2027` still carries the old `travellers`
key, so nothing moves there today. But *Bring them across* would have
created three participants with **empty names**, and that one click would
silently have trebled every unassigned per-person price on the trip.
Three people who are not named yet are not yet a party. An unnamed person
you tick yourself still counts — that was a deliberate answer.

**Two rooms are two bills.** `chooseOnePerStay`'s key gains the sorted
assigned ids. Same place and dates with different people means two bills;
the same people (or nobody) still means competing options, which is what
D13 was built for. Sorted, so ticking the same two in a different order
cannot invent a second room.

**Guests and party size follow the picker**, as a fill-in rather than a
lock — type over it and it sticks, and unticking everybody leaves your
number alone. The Everyone/Nobody buttons needed their own
`notifyChanged` hook: setting `.checked` in script raises no change
event, so the one button most likely to change a headcount would
otherwise not have updated it.

Two of my own assertions — from Phases 1 and 2, both saying the Budget
must not read Participants — were deliberately broken by this release and
were **restated rather than deleted**. What they protected is narrower
and still true: a trip with nobody on it costs exactly what it cost
before any of this existed.

New guard: `test-participant-costs.js`.

**Phase 4 — warnings DONE (v1.32.0).** Readiness gains: someone present with no
bed; a stay booked for fewer than are assigned; a joiner or leaver with no
flight; vehicle seats versus people assigned; and the age prompts. Note
**Italian city tax exemptions vary by comune** — Rome under 10, Florence
under 12, Venice under 6 with a reduced rate to 10 — so one national
threshold cannot be right. Also: the **EU 18–25 museum concession is for
EU citizens**, so it will not apply on Australian passports.

Five checks shipped, and most of the work was in what they must NOT say.
Readiness' own rule is that it reports only what it can be sure about —
*"a checklist that cries wolf gets ignored, and then the real gap gets
ignored with it"* — so each one stays silent until the trip has told it
enough:

| Check | Level | Silent when |
|---|---|---|
| Room booked for fewer than are on it | blocking | no guest count, or nobody assigned |
| Somebody with no bed | blocking | **any room that night is unassigned** — unassigned means the whole party, so there is no gap |
| More people than seats | blocking | `seats: 0`, which means does-not-apply |
| Joiner or leaver with no travel | tidy | they are on any flight or transport |
| Age prompts | tidy | the trip has no car / no flights / no city tax |

**The no-bed silence is the one that matters.** Every booking made
before Phase 2 is unassigned, so without that rule this check would have
fired on every night of every existing trip on its first run.

**The joiner check is deliberately "worth a look", not blocking.** They
might be driving themselves and the app cannot tell, so the wording says
so rather than asserting a missing booking.

**Age prompts never calculate**, and each fires only where the trip
actually has the thing the age affects — a young-driver warning on a trip
with no car is exactly the crying wolf the screen exists to avoid. The
city-tax prompt says the threshold is **per comune** rather than quoting
one as fact, because Rome, Florence and Venice all differ and they change.

New guard: `test-participant-readiness.js`.

**Participants is complete across all four phases.** Still open, and
unrelated to this work: D16 (city tax has no nightly cap), C12, UX-005.

New guard: `test-participants.js`.

### D21. `.badge` had no base CSS rule — DONE (v1.29.0)

Found while checking the Participants page in a real browser: only
`.badge.badge--<status>` was ever defined. Every badge WITHOUT a status
modifier had **no styling at all** and rendered as bare inline text
running into the heading beside it — 24 of them across ten modules,
including Flights' "Direct", "2 stops", "⚠ Arrival Not Set" and "Added
by", and the "Departed Day 1" badge added that morning in v1.28.0.

Geometry copied from `.snap-badge`, which is the same object under
another name. Neutral fill, since these state a fact rather than a status;
the status variants are (0,2,0) and still win over the base (0,1,0), so
nothing that already looked right changed.

Measured in a real browser rather than reasoned about: **9.29:1 dark**,
**8.43:1 light**, against a 4.5:1 requirement for 11.5px text.

---

### D22. Airports you can book that ourairports calls unscheduled — DONE (v1.33.1)

Reported by Mick: *"Western Sydney Airport IATA code WSI isnt in the
list, but is available on airline flight selectors"*. Both halves true.

The upstream row exists and is complete — id 507237, large_airport,
correct coordinates, municipality "Sydney", YSWS/WSI, keywords
"Badgerys Creek" — and says `scheduled_service: "no"`.

**The filter is right and upstream is behind.** The build keeps only
rows with `scheduled_service = yes`, deliberately: without it the list
balloons with airstrips that share codes and would only ever be wrong
suggestions. So a REBUILD WOULD NOT HAVE FIXED THIS, and loosening the
filter would have been the wrong fix.

A `SUPPLEMENT` list in `tools/build-airports.js` instead, applied at
build time so a rebuild keeps it — and seeded FIRST so that **upstream
wins on a code collision**. Each entry is self-deleting: the day
ourairports flips the flag, its row replaces ours and the entry becomes
harmlessly redundant. `assets/data/airports.json` is patched too, so it
works without anyone running the build.

**The ranking trap**: WSI's municipality is exactly `"Sydney"` while
SYD's is `"Sydney (Mascot)"`. The municipality-exact score was demoted
from 80 to 65 back in v1.17.0 for exactly this shape of problem, so
typing "Sydney" still gives SYD, then WSI, then Sydney NS. Verified
rather than assumed.

**Known gap, left alone deliberately**: typing "Badgerys" finds nothing.
ourairports carries it as a keyword and the build has never read the
keywords column for ANY airport. Adding one for a single entry would be
inconsistent, and WSI is reachable by code, by "Sydney" and by "Western
Sydney" — so it is recorded rather than hidden.

New guard: `test-airport-supplement.js`.

### D23. A flight with a stopover drew as one straight line — DONE (v1.34.0)

Reported by Mick: *"my map shows a flight sydney to milan, but its
actually 2 flights, syd-sin - sin-mxp, i dont like it"*.

**Structural, not a drawing bug.** The map draws one line per OVERNIGHT
STOP, and stops come from `day.overnight`. Singapore is a couple of hours
in a terminal, not a night, so no Singapore stop exists — and the line
ran straight from Sydney to Milan on a great circle that passes nowhere
near a city you actually spent time in.

**The fix was NOT to make stopovers into stops.** They have no
accommodation, no days and nothing to sleep in. Promoting them would put
Singapore on the stop rail, have Readiness ask where you are sleeping
there, and break the accommodation join.

Instead the flown leg draws its own shape: `flightPath()` returns
`[fromStop, ...stopover airports..., toStop]`. The ENDPOINTS stay the
stops so the line still meets both pins; only the middle is the flight's.

- **A direct flight is untouched** — no intermediate airports, so it
  draws exactly the straight line it always did.
- **An unresolvable airport is skipped, not guessed at.** A leg saved
  before v1.17.0 holds free text like "Sydney Airport"; bending toward a
  wrong place is worse than not bending.
- **`flightForLeg` reuses the exact predicate `legModeKey` uses**, so the
  line drawn and the mode reported can never disagree. A test asserts the
  predicate appears in those two places and nowhere else.
- **A leg that should have been a road never gets a dogleg** — `routeAs`
  short-circuits it.

`.tm-over` marks each change: a small hollow dot with the code and a
"Changed at …" tooltip, deliberately NOT a stop pin.

**A guard caught it correctly.** `test-v1113-mobile-bugs.js` asserts no
surface in the map panel is hard-coded white, exempting `.tm-pin` and
`.tm-plabel` by name — *"so the exemption stays a decision rather than a
loophole"*. `.tm-over` is white for the identical C17 reason (it sits on
map tiles, which are the same beige in both themes), so it was ADDED TO
THE NAMED EXEMPTION in both that suite and `test-map-ink-contrast.js`,
which also asserts it is ENTIRELY literal. Half-themed is what broke C17.

**Built against the described shape, not against real data**: the trip in
question (`italy-27`) is not in the repo copy of `data/projects`. Worth a
look on the live map.

New guard: `test-stopover-map.js`.

### D24. Eight UI/UX items from using it — SIX DONE (v1.35.0), TWO NOT NEEDED

Raised by Mick 2026-08-30 after real use. Six built, two deliberately not
— and one not reproducible.

| # | Item | Outcome |
|---|---|---|
| 1 | Editing a day dropped you at the top of a 52-day planner | DONE |
| 2 | A trip could not be renamed | DONE — display name only |
| 3 | Copy loses accommodation / transport | CLOSED — see D30 |
| 4 | Days in transit home | DONE — recorded and flagged |
| 5a | Check-out defaulted to the SAME day as check-in | DONE |
| 5b | 24-hour clock | ALREADY TRUE — see below |
| 6 | Splits for a night elsewhere | NOTHING TO BUILD |
| 7 | Group accommodation by stay | DONE |
| 8 | Clickable booking link | DONE |

**#3 is not reproducible.** Verified end to end against the real trip
through a real server: files copy (accommodation 4→4, activities 2→2,
flights 1→1), and the browser's own static fetch returns 200 with the
right counts. Only `expenses.json` and `journal.json` are excluded, by
design. Two candidates left with Mick: was the copied trip `italy-27`
(absent from the repo copy), or was the accommodation page filtered to a
day rather than showing all? **Nothing changed, because nothing is known
to be wrong.**

**#5b was already true.** `<input type="time"` stores 24-hour, and the
app renders that value raw — nothing anywhere formats a time. Only the
picker WIDGET is 12-hour, and that follows the OS locale with no HTML or
CSS override. Native pickers kept: they are far better on a phone.
Windows: Settings → Time & language → Language & region → Regional
format.

**#6 needs nothing.** Phase 2 assignment already covers it — give the two
their own accommodation for those nights and tick them. The journey stays
one line per day, which is what Mick chose.

**#2 is the display name only.** The name lives in TWO places and both
move together: `project.json`'s `project.name`, and the ownership record
the trip LIST is built from. Read-modify-write rather than
`setTripOwner`, which would rewrite the owner — a rename must never
change who owns the thing. The folder id does NOT move: renaming it would
mean moving the directory, rewriting ownership and sharing, and breaking
every link anyone already holds, so a trip renamed "Italy 2028" still
lives at `#/italy-27`.

**#4 is "worth a look", not blocking**, and is SILENT on an unassigned
flight — one falling outside the dates is far more likely a date typo
than somebody's journey home.

**A real gap found by a failing suite**: `scrollToDay` checked the
element existed but not that it had `scrollIntoView`. Every real browser
has it, so it would not have bitten — but a function whose whole job is a
nicety should never be the reason a page throws.

**An over-specified assertion of my own**: `test-copy-trip.js` pinned the
route matcher as exactly `(archive|copy)`, so adding `rename` to the same
route failed a copy test. Loosened to "copy is in the list", which is all
that suite ever cared about.

New guard: `test-ux-round-1350.js`.

### D25. Who has access, and dates that disagree with days — DONE (v1.36.0)

Both raised by Mick 2026-08-30.

**A booking whose DATE disagrees with the DAY it sits on.** The app plans
in days, every booking holds a real date, and nothing ever compared them.
The sample trip is the argument, and it lit up immediately — five real
errors, three and a half months out and completely invisible:

```
Hotel Davanzati:  check-in  Wed 5th May  ·  Day 4 is Fri 20th Aug
Hotel Artemide:   check-out Wed 5th May  ·  Day 3 is Thu 19th Aug
```

Covers accommodation (both ends), transport, activities, restaurants and
flights. **Flights need their own handling**: since v1.28.0 a flight can
land on a LATER day than it departed, so comparing the arrival against
the departure day would flag every long-haul flight ever entered.

**SHORTLISTED OR BEYOND**, on Mick's correction to the first cut:
*"if you do all the research at 1 time and mark the favorite as
shortlisted you could incorrectly book it from the link, if dates are
wrong, not good."* Exactly right — Shortlisted is the moment you stop
comparing and start booking, so waiting for Selected flags the error
AFTER the money has gone. Research stays silent: those dates really are
provisional when you enter five hotels in a sitting.

**And the flag goes where you are looking.** Readiness is a screen you
VISIT; the accommodation card is the one you book FROM. So detection
moved out of the check into `Readiness.dateIssuesFor()` and
`dayHasDateIssue()`, and the same fact appears three times: a red left
edge and a flag on the accommodation card, a quiet line on the Planner
day card, and the full explanation in Readiness. **One source, three
surfaces** — if the rule changes, it changes once, and the screens cannot
drift apart.

A left edge rather than a red card: loud enough to stop you clicking
through, quiet enough to live in a list where most entries are fine.

**It names the disagreement, not a culprit** — the booking may be on the
wrong date or on the wrong day, and the app cannot tell which.

**Who has access.** The trip card carries the names; Settings carries the
full list with each person's real permission and anyone invited who has
not joined.

**A PERMISSION I LOOSENED AND THEN REVERTED.** I opened the share LIST to
anyone with trip access, reasoning that they are already trusted with the
whole trip. Two guards said otherwise by name — `test-sharing.js`, and
`test-guest-and-fixes.js` under a section headed *"guest: cannot manage
sharing or delete"*. They were right: the request was for a way to SEE
who has access, from the trip's owner, and owner-only delivers that
completely — so the loosening bought nothing and cost a boundary somebody
had deliberately drawn. Reverted, with the reasoning left in the code so
the argument is not re-made from scratch.

**A side channel closed with it**: the trip list would have carried
`sharedWith` to collaborators. Handing over the roster through the back
door while the front door returns 403 is worse than either answer alone,
because it looks like the boundary holds. A collaborator now sees an
honest "only the owner can see this" rather than an error.

**Transport findings name the leg.** Transport has no `name` field, so
the first version read *"Transport: departure is…"*, which says nothing
about which leg. Now *"Train Rome to Florence: …"*.

New guard: `test-access-and-datecheck.js`.

### D26. The Dashboard was rendering the Planner inside itself — DONE (v1.37.0)

Mick: *"Dashboard, isnt it the same as planner? we can either drop it, or
replace it with a true dashboard, whats do you think we should do?"*

**Measurable, not a matter of taste.** `dashboard.js` line 53 was
`${Planner.render()}`. Against the real trip: **30,969 characters**, of
which its own content was ~1,200 and the embedded Planner **27,943** — so
roughly 80% of what you scrolled on the Dashboard WAS the Planner, day
cards and "+ Add Day to End" and all. On a 52-day trip, twice.

So neither dropped nor rebuilt: **one line deleted**. Now 3,817
characters, an 88% cut, and both screens have their identity back.

Two gaps the measurement exposed, filled at the same time:

- **`grep -c Readiness app/dashboard.js` → 0**, while the trip it was
  describing had 13 findings, five of them bookings on wrong dates. The
  most useful number the app can show was the one missing from the screen
  you land on. Now a tappable summary — and **silent when there is
  nothing wrong**, because a green all-clear on every visit is a banner
  people stop reading, and then stop seeing when it turns red.
- **No route out.** With the embedded copy gone there was no way from the
  Dashboard to the day list at all — it had been relying on simply BEING
  it. Quick links added, with **Budget hidden from a guest**: the sidebar
  hides it for the same reason and a shortcut must not be the way round.

### D27. The accommodation booking link — DONE (v1.37.0)

Mick: *"i tried to click the link in accommodation, but it didnt do
anything, should we add another button to follow the link or can you fix
the code so it works properly?"*

**The card link was verified WORKING in a real browser** — correct href
with the scheme added, `target="_blank"`, `pointer-events: auto`, and it
is the topmost element at its own centre. Two things were wrong with it
anyway: a **double arrow** (`.snap-link::after` already adds " ↗" and the
label carried one too) and a **138×14 px** target — fine with a mouse,
mean with a thumb. Now 125×32.

**The one actually missing was in the FORM.** The Website field is a
plain text input: you paste a URL, look at it sitting there, click it,
and nothing happens, because a textbox is not a link. An **Open ↗** button
now sits beside it and reads the **live** field value, so a link can be
checked before saving. Verified by typing a new URL and clicking it.

Worth noting: all four accommodation items in the repo copy have
`website: ""`, so there would have been no card link to click regardless.

New guard: `test-dashboard-and-link.js`.

### D28. Three fixes found by running the REAL trip — DONE (v1.38.0)

Mick sent the live `italy-2027` files (52 days, 4 travellers, 26
accommodation options). Running them through the app found three things
no fixture had.

**1. Forty-nine alarms for one problem.** Every night reported *"nowhere
to sleep"*, because the check wants something Selected or Booked and the
whole trip is Research and Shortlisted. True, and it buried the two that
mattered — seven consecutive nights in Locorotondo and Matera with
genuinely nothing.

A night with three shortlisted options is **not** "nowhere to sleep" —
it is a decision not made. Split into two findings at two levels, and
consecutive nights group, named by place when the whole run is one place
(and NOT named when it spans several, which would mislead).

**The real trip went from 52 findings to 7**, with both real gaps at the
top.

**2. `"in transit"` was not transit.** Days 1, 50 and 51 carry
`overnight: "in transit"` with no flag, so the app asked where you were
sleeping while you were on a plane, and the map had a town called *In
Transit* it could not place. `isTransit` already special-cases the legacy
`"flight"` spelling for exactly this reason.

**3. An impossible age went quiet.** A date of birth of `0001-08-20` —
almost certainly 2001 — makes somebody **2025 years old**, which fell
past the last band's ceiling, so `band()` returned null and the app
simply had no age. **Silence is the wrong answer to nonsense**: it looks
identical to "no birthday given". `band()` now refuses anything over 125
(the oldest verified person was 122) and `ageLooksWrong()` names it.

**Two of my own assertions broke, both pinned to numbers rather than
behaviour**: `test-v1110` matched on the word "sleep" (the finding was
reworded, not removed) and `test-dashboard-and-link` asserted the
all-one-kind wording against whatever the sample trip happened to
produce — which became a mix once this shipped. Both now pin the
behaviour.

**Still in Mick's data, reported not fixed** (his to change):

- Tyler's DOB `0001-08-20`, and his `dayRange [1,16]` against a Day 18
  note saying one traveller flies home from Venice (days 14–18).
- **Tango House** and **Fenice** are both dated `2027-08-17` (the trip
  start, the old check-in default) rather than their real nights. Both
  are Research, so the date check is silent — **it fires the moment
  either is shortlisted**, which is exactly the case D25 was built for.
- City tax currencies disagree within a city: Milan 9.5 **AUD** vs 9.5
  **EUR**, Venice 5 **AUD** vs 5 **EUR**.

New guard: `test-readiness-noise.js`.

### D29. Close-out: three review items that were never tracked

Asked 2026-08-31: *"is there anything else from the bugs/UI/UX feedback
sessions we need to close out?"* Traced every ID in the source documents
back through this file. **BUG-08, BUG-09 and BUG-10 appear in
`bug-list-and-fixes.md` and were never recorded here** — a tracking gap,
not a code gap. All three verified in the current source rather than
trusting the document's own "Fixed in v1.4.1" claim:

- **BUG-08** (journal checklist/photo delete had no confirmation) —
  genuinely fixed. Both `removeChecklistItem` and `removePhoto` now go
  through `UI.confirm`, having been migrated from the native `confirm()`
  along with everything else in v1.20.0.
- **BUG-09** (auth and sharing swallowed fetch errors) — fixed as
  specified. `sharing.js` has three catch blocks and three
  `console.error`; `auth.js` logs in login, register and logout, which
  are the three the bug named. Its FOURTH catch is `check()`, the session
  probe that runs on every page load — **silence there is correct**, not
  an oversight: a logged-out visitor is the ordinary case, and logging an
  error every load would be noise rather than a breadcrumb.
- **BUG-10** is not a bug. It is the document's own status paragraph, and
  the ID appears only because the regex found it.

### D30. Copy this trip — CLOSED, verified against the real trip

Reported 2026-08-30 as *"when you copy a trip, the accommodation doesnt
come across, neither does the transport"*, and recorded as NOT
REPRODUCIBLE because the repo copy of `data/projects` was a week stale.

Mick sent the live `italy-2027` files on 2026-08-31, so it could finally
be tested against the data it was reported on. Through a real server,
with the browser's own static fetch:

```
accommodation.json   27 items -> 27      GET -> 200  27 items
transport.json        5 items ->  5      GET -> 200   5 items
activities.json       5 items ->  5      GET -> 200   5 items
flights.json          1 item  ->  1
MISSING: expenses.json, journal.json     (by design)
```

**The copy works.** All 12 non-excluded files and the whole
`destinations/` folder arrive, and the copier can read them. Whatever was
seen was not the copy losing data — most likely the accommodation view
filtered to a single day rather than showing all. Closed.

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
