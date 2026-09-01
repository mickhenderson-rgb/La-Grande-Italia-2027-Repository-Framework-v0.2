# Driving day route planning — spec

Workshopped with Mick 2026-09-02.

**Phase 1 shipped in v1.40.0** (kilometres and time) and **phase 2 in
v1.41.0** (fuel). Phase 3 (tolls) is still design only. The decisions and
the API findings below stand for all three, so they are not re-litigated
or re-derived.

Goal: for each day you drive, know the kilometres, the time, the fuel and
the tolls — and get those into the Budget and a whole-trip total.

---

## 1. What the provider actually gives us

Verified 2026-09-02 with a real call against Geoapify, Rome → Naples
(`waypoints=41.9028,12.4964|40.8518,14.2681&mode=drive&details=route_details`).

The response is **168,543 bytes** and carries per-segment road detail:

```
speed, speed_limit, truck_limit, surface, lane_count, road_class, name,
toll, tunnel, bridge, roundabout, rightside, traversability, elevation,
country_code, from_index, to_index, distance, time
```

The findings that matter:

- **`toll` is a BOOLEAN per segment, not a price.** 360 segments on that
  route, 225 of them tolled.
- **Every segment carries its own `distance` (metres) and `time`
  (seconds).** So tolled distance is a straight sum over the segments
  where `toll === true` — measured, not inferred.
- **`country_code` per segment**, so a drive crossing a border splits by
  country without us guessing where the crossing was.
- **`elevation` per segment.** Not used in v1, noted for later — a
  mountain day burns more fuel and takes longer than flat distance
  suggests.

This is better than the fallback that was originally proposed (compare a
normal route against `avoid=tolls` and infer the tolled portion from the
difference). No second provider and no second API key are needed.

### What already exists in the app

- `Geo.route(points)` **already accepts N waypoints**, not just A→B. A
  day's drive with stops along the way is one call.
- Results are **cached in the browser and again on the server for 24h**,
  so re-opening the map doesn't re-spend credits.
- `avoid` is **already allow-listed** on the server proxy.
- `routeSummaryText` already totals km and minutes for drivable legs.

### The two plumbing changes needed

1. **`details` is not in `GEOAPIFY_ALLOWED_PARAMS`** (`server.js`) — which
   is currently `text, limit, lang, filter, bias, type, lat, lon,
   waypoints, mode, units, avoid`. It needs adding.
2. **`shapeRoutingResponse` discards everything** except `distanceKm`,
   `durationMinutes` and `path`. It must also return `tolledKm` and the
   per-country split — and must keep distilling, so the browser never
   receives the 168KB.

Credit cost is per waypoint pair (+1 per 500km beyond the first 500), so
a five-stop day costs more than a two-stop one. Cached, so once only.

---

## 2. Decisions taken

Recorded so they aren't reopened.

| Question | Decision |
|---|---|
| How a driving day gets its route | **Seeded, then editable.** Pre-filled from the stops either side; waypoints can be added, reordered, and the end set back to the start for a round trip. |
| Tolls | **Measured tolled distance × an editable per-country rate.** Confirmed possible above. |
| Vehicle specs | **Manual, with a class fallback.** Real figures entered on the hire car when booked; a class table (economy/compact/SUV/van) fills in until then, visibly as an estimate. |
| Output | **Per-day summary, Budget lines, and a whole-trip total.** |
| Long-day readiness check | **Explicitly not wanted.** Do not build. |
| Estimated fuel vs real spend | **Estimate is its own line, superseded by real spend** for that period — as a booked price supersedes a researched one. |
| Cost split | **One vehicle cost, not split per person.** Matches how it's actually paid. Consequence accepted: a per-person trip total carries no driving cost. Display decision, revisitable. |

---

## 3. Data model

Three small additions. No new files.

### A journey day gains an optional `drive`

Only present on days actually driven — which is what separates "the car is
booked days 2–22" from "I drive on eight of those days".

```
drive: {
  waypoints: [ { label, lat, lng } ],   // seeded from the stops either side
  vehicleId: "TRN-...",                  // the Car Rental transport record
  driverId: "PT-...",                    // optional participant
  route: {                               // cached provider result
    km, minutes, tolledKm,
    byCountry: { IT: { km, tolledKm }, CH: { km, tolledKm } },
    fetchedAt
  }
}
```

A round trip is the case the current model cannot express at all: start
and end are the same stop, so today it reads as zero kilometres.

### A Car Rental transport record gains `vehicle`

```
vehicle: { class, fuelType, litresPer100km }
```

`class` drives the fallback table (economy ~5.5, compact ~6.5, SUV ~8.5,
van ~9.5 L/100km — indicative only). An entered `litresPer100km` always
wins. Anything derived from the class table must be labelled an estimate
wherever it is shown.

### Project settings gain `driving`

```
driving: {
  rates: {
    IT: { fuelPerLitre, currency, toll: { type: "perKm", rate } },
    CH: { fuelPerLitre, currency, toll: { type: "vignette", cost, period: "annual" } }
  },
  setOn: "2026-09-02"
}
```

`setOn` is load-bearing: a price set in 2026 for a 2027 trip is an
assumption, and must never present itself as live data.

### Tolls are not one kind of thing

**Italy, France and Spain charge per kilometre. Switzerland, Austria,
Czechia and Slovenia use a vignette** — a sticker bought once (Swiss is
annual, roughly CHF 40), with a fine for driving without one.

This trip drives Italy → Le Noirmont (CH) → Italy, so it is not
hypothetical. A per-km rate applied to Switzerland would produce a
confidently wrong number *and* leave out the thing actually needing to be
bought. Hence `toll.type` rather than a bare number, and a flag when a
route first crosses into a vignette country.

---

## 4. The three numbers

- **Kilometres and time** — solved by the routing call once the waypoint
  list exists.
- **Fuel** — `km ÷ 100 × litresPer100km × fuelPerLitre`, per country using
  the segment `country_code` split.
- **Tolls** — per-km countries: `tolledKm × rate`. Vignette countries: the
  flat cost, once per trip, not per day.

---

## 5. Build order

Each phase is shippable alone.

1. ~~**Waypoints, km and time.** Per-day summary and trip total. No money.~~
   **DONE - v1.40.0.** `app/drive.js`, a Driving panel on the Day view, a
   line on the Planner day card, and a "km driving" trip stat. Neither
   plumbing change was needed yet: phase 1 uses the existing
   `Geo.route()` and the distance the proxy already returns.
2. ~~**Fuel.** Vehicle fields, class fallback, price settings, Budget line.~~
   **DONE - v1.41.0.** Vehicle & fuel fields on the Car Rental record, the
   class table in `Drive.CLASSES`, a Fuel prices card in Settings, a Fuel
   card in the drive editor, and one netted Budget line.

   **Deviation from section 4:** fuel does NOT yet use the per-segment
   `country_code` split. That needs the `details` plumbing, which is phase
   3 work. Instead each driving day names WHICH country's price to use,
   defaulting to the project default. Manual, honest, and superseded
   automatically once the split lands.
3. **Tolls.** `details` through the proxy, `tolledKm` out of it, rate
   table with both types, vignette flag, Budget line.

Trip total is worth more than it first appears: hire agreements often
carry an excess-mileage cap, and a total tells you before signing whether
you are near it.

---

## 6. Open / deferred

- **Elevation** is available per segment and unused. A day with 1,800m of
  climbing burns more fuel and is slower than its distance implies.
  Deferred, not forgotten — the Dolomites leg is where it would show.
- **Driver eligibility.** Participants already carry age bands, and the
  19–26 band was called out specifically because of hire cars. A driving
  day can name a driver; whether to check that driver against the band, or
  against a young-driver surcharge, is not yet decided.
- `checkVehicleSeats` already exists in Readiness, so vehicle-to-people is
  half wired already.
