# COMPASS-TOS — Open Backlog

Known bugs and gaps, with enough detail to act on without re-deriving them.

Distinct from `future-roadmap.md`, which holds features deliberately
deferred to a later version. This file is things that are wrong, missing,
or unverified **now**.

Last reviewed: 2026-08-28 (v1.21.0).

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
| A12 | Web story (§B4) | OPEN — the genuinely separate build |
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

### C12. Old flights still hold free text — OPEN (housekeeping, not a bug)

Legs saved before v1.17.0 keep phrases like "Sydney Airport". They
display and match exactly as before, but they do not carry a code, so the
map falls back to matching them by name. Reopening a flight and re-picking
each airport from the list upgrades it. Nothing breaks if that never
happens.

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

### A11 (second half). Web story — OPEN

The genuinely separate build, and the agreed order was photo book first.
A vertical, tap-through, phone-first telling of the trip. Nothing of it
exists yet, and nothing claims it does — `test-journal-export.js` asserts
that the words "web story" appear nowhere, precisely so it cannot be
claimed before it is built.

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

### C20. `--color-primary` is unreadable as text in dark mode — PARTLY DONE (v1.21.0)

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
