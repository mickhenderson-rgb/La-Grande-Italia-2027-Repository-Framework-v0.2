/*
=========================================================

COMPASS-TOS

Build the airport list

Rebuilds assets/data/airports.json from ourairports.com,
which is public domain and updated continuously.

  node tools/build-airports.js assets/data/airports.json

Run it when codes look stale - airports open, close and
change hands - not on any schedule. The output is committed,
so the app never depends on this script or on that site
being up.

Filtered to a real 3-letter IATA code AND scheduled service:
"somewhere you can actually book a flight to". Small
airports are KEPT deliberately - 764 of them are Greek
islands, Scottish isles and remote strips people genuinely
fly to.

Field names are single letters because this file ships to
phones: c=code, n=name, m=municipality, k=country,
t=size (3 large, 2 medium, 1 small), y=lat, x=lon. That
naming is worth about 90 KB.

=========================================================
*/

const https = require("https");
const fs = require("fs");
const path = require("path");

const OUT = process.argv[2];

const URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";

// Minimal RFC4180 row parser - the file has quoted fields containing commas
// ("Chicago O'Hare International Airport", "Washington, D.C.") and doubled
// quotes inside them. Splitting on "," loses roughly 40% of the rows.
function parseRow(line) {
  const out = [];

  let field = "";

  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];

    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; } else { quoted = false; }
      } else { field += c; }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      out.push(field); field = "";
    } else { field += c; }
  }

  out.push(field);

  return out;
}

https.get(URL, (res) => {
  let body = "";

  res.setEncoding("utf8");

  res.on("data", (c) => { body += c; });

  res.on("end", () => {
    const lines = body.split("\n");

    const head = parseRow(lines[0]);

    const col = {};

    head.forEach((h, i) => { col[h.trim()] = i; });

    const need = ["iata_code", "name", "municipality", "iso_country", "type", "scheduled_service", "latitude_deg", "longitude_deg"];

    const missing = need.filter((n) => col[n] === undefined);

    if (missing.length) { console.error("columns missing:", missing.join(", ")); process.exitCode = 1; return; }

    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) { continue; }

      const r = parseRow(lines[i]);

      const iata = (r[col.iata_code] || "").trim().toUpperCase();

      // A real 3-letter IATA code AND airlines that actually fly there.
      // Without scheduled_service the list balloons with airstrips that
      // share codes and would only ever be wrong suggestions.
      if (!/^[A-Z]{3}$/.test(iata)) { continue; }

      if ((r[col.scheduled_service] || "").trim() !== "yes") { continue; }

      const type = (r[col.type] || "").trim();

      if (type !== "large_airport" && type !== "medium_airport" && type !== "small_airport") { continue; }

      rows.push({
        c: iata,
        n: (r[col.name] || "").trim(),
        m: (r[col.municipality] || "").trim(),
        k: (r[col.iso_country] || "").trim(),
        t: type === "large_airport" ? 3 : type === "medium_airport" ? 2 : 1,
        y: Math.round(Number(r[col.latitude_deg]) * 10000) / 10000,
        x: Math.round(Number(r[col.longitude_deg]) * 10000) / 10000,
      });
    }

    // Duplicate IATA codes exist in the raw data. Keep the biggest.
    const byCode = {};

    rows.forEach((a) => {
      const prev = byCode[a.c];

      if (!prev || a.t > prev.t) { byCode[a.c] = a; }
    });

    const list = Object.keys(byCode).sort().map((k) => byCode[k]);

    fs.writeFileSync(OUT, JSON.stringify({ generated: "ourairports.com (public domain)", airports: list }));

    const kb = Math.round(fs.statSync(OUT).size / 1024);

    console.log(`${list.length} airports -> ${OUT} (${kb} KB)`);

    ["MXP", "LIN", "BGY", "SIN", "SYD", "DOH", "BSL", "ZRH", "GVA"].forEach((c) => {
      const a = byCode[c];

      console.log("  " + c + ": " + (a ? a.n + " | " + a.m + " | " + a.k : "MISSING"));
    });
  });
}).on("error", (e) => { console.error("ERR", e.message); process.exitCode = 1; });
