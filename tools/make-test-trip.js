/*
  A TEST COPY OF THE FIRST FEW DAYS OF A TRIP, MOVED TO NOW.

  For trying the day maps, the country split and the photo locations
  without waiting for the real trip or touching the real data.

  WHY THIS IS A SCRIPT AND NOT A FOLDER IN THE REPOSITORY.

  data/projects/ is gitignored, deliberately and for two reasons written
  in the .gitignore itself: this repository is PUBLIC and real itineraries
  must not go in it, and a pull must never collide with live trip data on
  disk. So a test trip cannot be delivered by committing it - it has to be
  built where the data lives, which is here.

  That turns out better anyway: it reads the REAL trip on this server
  rather than a copy taken weeks ago.

  WHAT IT INVENTS, and says so: photo locations and breadcrumbs. They are
  scattered around the places the trip actually visits so the maps look
  like real days. Everything else - the days, their titles, where you
  sleep - is copied from the source trip.

  Node 10.24.1 compatible: it runs on the production host.

  USAGE

    node tools/make-test-trip.js <source-folder>
    node tools/make-test-trip.js <source-folder> --days 10 --today 5
    node tools/make-test-trip.js <source-folder> --confirm

  Nothing is written without --confirm, and an existing test folder is
  never overwritten without --force.
*/
var fs = require("fs");
var path = require("path");

var ROOT = path.resolve(__dirname, "..");

var args = process.argv.slice(2);

var source = "";

var dayCount = 10;

var todayIsDay = 5;

var target = "";

var confirm = false;

var force = false;

for (var i = 0; i < args.length; i++) {
  if (args[i] === "--days") { dayCount = Number(args[i + 1]); i += 1; }
  else if (args[i] === "--today") { todayIsDay = Number(args[i + 1]); i += 1; }
  else if (args[i] === "--into") { target = args[i + 1] || ""; i += 1; }
  else if (args[i] === "--confirm") { confirm = true; }
  else if (args[i] === "--force") { force = true; }
  else if (args[i].indexOf("--") !== 0 && !source) { source = args[i]; }
}

function die(message) {
  console.error("\n  " + message + "\n");

  process.exit(1);
}

if (!source) {
  die("Usage: node tools/make-test-trip.js <source-folder> [--days 10] [--today 5] [--confirm]");
}

if (!(dayCount > 0) || !(todayIsDay > 0) || todayIsDay > dayCount) {
  die("--days must be positive and --today must fall inside it.");
}

if (!target) {
  target = "test-" + source.slice(0, 24) + "-first-" + dayCount;
}

var projects = path.join(ROOT, "data", "projects");

var from = path.join(projects, source);

var to = path.join(projects, target);

if (!fs.existsSync(from)) {
  var available = [];

  try {
    available = fs.readdirSync(projects);
  } catch (error) { /* no projects dir */ }

  die("No trip at " + from + "\n  Trips here: " + available.join(", "));
}

if (fs.existsSync(to) && !force) {
  die(target + " already exists. Use --force to rebuild it, which DISCARDS whatever is in it.");
}

function readJson(dir, name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
  } catch (error) {
    return fallback;
  }
}

var journey = readJson(from, "journey.json", null);

var project = readJson(from, "project.json", null);

if (!journey || !Array.isArray(journey.days) || journey.days.length === 0) {
  die("That trip has no journey to copy.");
}

if (!project || !project.project) {
  die("That trip has no project.json to copy.");
}

// --- Dates ------------------------------------------------------------

function isoOf(date) {
  return date.toISOString().slice(0, 10);
}

function plusDays(iso, days) {
  var d = new Date(iso + "T00:00:00Z");

  d.setUTCDate(d.getUTCDate() + days);

  return isoOf(d);
}

var today = isoOf(new Date());

// Day one is however many days back today is supposed to be.
var dayOne = plusDays(today, -(todayIsDay - 1));

var days = journey.days.slice(0, dayCount).map(function (day, index) {
  var copy = JSON.parse(JSON.stringify(day));

  copy.date = plusDays(dayOne, index);

  return copy;
});

// --- Where things are -------------------------------------------------

/*
  Coordinates for scattering the invented photographs around. A place that
  is not here simply gets no photographs, which is a thinner test rather
  than a wrong one - the DRIVES do not need this, because their waypoints
  are resolved by the app the same way yours are when you press "Work out
  the route".
*/
var PLACES = {
  "sydney": [-33.8688, 151.2093],
  "milan": [45.4642, 9.19],
  "le noirmont": [47.2119, 6.9603],
  "vigano san martino": [45.7333, 9.8167],
  "bolzano": [46.4983, 11.3548],
  "venice": [45.4408, 12.3155],
  "siena": [43.3188, 11.3308],
  "rome": [41.9028, 12.4964],
  "palermo": [38.1157, 13.3615],
  "cefalu": [38.0397, 14.0228],
  "syracuse": [37.0755, 15.2866],
  "taormina": [37.8516, 15.2853],
  "tropea": [38.6768, 15.8983],
  "locorotondo": [40.7549, 17.3266],
  "matera": [40.6664, 16.6043],
  "sorrento": [40.6263, 14.3757],
  "maratea": [39.9936, 15.7222],
  "dolomites": [46.4102, 11.8440],
};

function placeOf(name) {
  return PLACES[String(name || "").trim().toLowerCase()] || null;
}

function isTransitWord(value) {
  var said = String(value || "").trim().toLowerCase();

  return said === "flight" || said === "in transit" || said === "transit";
}

// --- Drives -----------------------------------------------------------

/*
  A drive on every day that CHANGES where you sleep, which is what a
  driving day is. Waypoints carry names and no coordinates on purpose:
  the app resolves them exactly as it does for a drive you add yourself,
  so pressing "Work out the route" exercises the real path rather than a
  shortcut this script took.
*/
var driveDays = [];

days.forEach(function (day, index) {
  if (index === 0) {
    return;
  }

  var wokeIn = days[index - 1].overnight;

  var sleepIn = day.overnight;

  if (!wokeIn || !sleepIn || isTransitWord(wokeIn) || isTransitWord(sleepIn)) {
    return;
  }

  if (String(wokeIn).toLowerCase() === String(sleepIn).toLowerCase()) {
    return;
  }

  day.drive = {
    waypoints: [
      { label: wokeIn, lat: null, lng: null },
      { label: sleepIn, lat: null, lng: null },
    ],
    route: null,
    vehicleId: "TRN-TEST-CAR",
    country: "",
  };

  driveDays.push(day.day);
});

// --- Invented photographs and breadcrumbs -----------------------------

var participants = (project.project.participants || []).slice(0, 4).map(function (p, i) {
  var copy = JSON.parse(JSON.stringify(p));

  // Two linked to logins so the day map can tell their photographs apart,
  // and the rest left unlinked - which is worth seeing too.
  copy.linkedUser = i === 0 ? "Mick_H" : i === 1 ? "ux_review_test" : "";

  copy.dayRange = null;

  return copy;
});

var photographers = participants
  .filter(function (p) { return p.linkedUser; })
  .map(function (p) { return p.linkedUser; });

if (photographers.length === 0) {
  photographers = ["Mick_H"];
}

// Deterministic scatter: the same trip always builds the same test data,
// so a second run is comparable with the first.
var seed = 7;

function wobble() {
  seed = (seed * 1103515245 + 12345) % 2147483648;

  return (seed / 2147483648 - 0.5) * 0.02;
}

var entries = [];

var photoNumber = 0;

days.forEach(function (day, index) {
  // Only the days already behind us: a photograph from tomorrow is not a
  // thing, and the point is to see what a trip in progress looks like.
  if (index + 1 > todayIsDay) {
    return;
  }

  var here = placeOf(day.overnight) || placeOf(day.location);

  if (!here) {
    return;
  }

  var photos = [];

  var trace = [];

  // Two or three a day, alternating between the people who have logins -
  // which is what gives the map two colours to separate.
  var count = 2 + (index % 2);

  for (var n = 0; n < count; n++) {
    photoNumber += 1;

    photos.push({
      id: "PHT-TEST-" + photoNumber,
      url: "",
      archiveUrl: "",
      caption: "Test photo " + photoNumber,
      addedBy: photographers[(photoNumber - 1) % photographers.length],
      takenAt: day.date + "T" + String(9 + n * 3).padStart(2, "0") + ":20:00",
      location: {
        lat: Math.round((here[0] + wobble()) * 1e5) / 1e5,
        lng: Math.round((here[1] + wobble()) * 1e5) / 1e5,
        source: "photo",
      },
    });
  }

  // A departure breadcrumb on a driving day - the thing a photograph
  // cannot record, because the driver is not the one photographing.
  if (day.drive) {
    var from2 = placeOf(day.drive.waypoints[0].label);

    if (from2) {
      trace.push({
        lat: from2[0],
        lng: from2[1],
        at: day.date + "T08:30:00",
        source: "device",
        by: photographers[0],
        why: "leaving",
      });
    }
  }

  entries.push({
    day: day.day,
    notes: "Test entry for day " + day.day + ".",
    notesAuthor: photographers[0],
    checklist: [],
    photos: photos,
    trace: trace,
  });
});

// --- Report, then write -----------------------------------------------

console.log("\n  Source:      " + source + "  (" + journey.days.length + " days)");

console.log("  Building:    " + target);

console.log("  Days:        " + days.length + ", " + dayOne + " to " + plusDays(dayOne, days.length - 1));

console.log("  Today:       " + today + " = day " + todayIsDay);

console.log("  Drives on:   " + (driveDays.length ? "day " + driveDays.join(", ") : "none"));

console.log("  Invented:    " + photoNumber + " photo locations, " +
  entries.reduce(function (n, e) { return n + e.trace.length; }, 0) + " breadcrumbs, over " + entries.length + " days");

console.log("  Linked:      " + participants
  .filter(function (p) { return p.linkedUser; })
  .map(function (p) { return p.name + " -> " + p.linkedUser; })
  .join(", ") || "  Linked:      nobody");

if (!confirm) {
  console.log("\n  Nothing written. Re-run with --confirm to build it.\n");

  process.exit(0);
}

if (fs.existsSync(to) && force) {
  console.log("\n  Rebuilding (--force), discarding what was there.");
}

fs.mkdirSync(to, { recursive: true });

fs.mkdirSync(path.join(to, "destinations"), { recursive: true });

function write(name, data) {
  fs.writeFileSync(path.join(to, name), JSON.stringify(data, null, 2), "utf8");
}

write("journey.json", { version: "1.0", days: days });

write("project.json", {
  project: {
    id: target,
    name: "TEST - " + (project.project.name || source) + ", first " + days.length + " days",
    subtitle: "Test copy for trying the day maps. Invented photo locations. Not the real trip.",
    status: "Travel",
    version: "1.0",
    created: today,
    departureDate: dayOne,
    returnDate: plusDays(dayOne, days.length - 1),
    homeCountry: project.project.homeCountry || "",
    currency: project.project.currency || "AUD",
    language: project.project.language || "en",
    archived: false,
    participants: participants,
  },
  settings: {
    planningMode: false,
    travelMode: true,
    journalMode: false,
    darkTheme: false,
    currency: project.project.currency || "AUD",
    distanceUnits: "km",
    temperatureUnits: "C",
    // Filled in so the fuel and toll figures appear without any setting
    // up, and so Switzerland shows as a vignette rather than a per-km
    // rate - which is half of what this test is for.
    driving: {
      rates: [
        { country: "Italy", code: "IT", fuelPerLitre: 1.85, currency: "EUR", toll: { type: "perKm", rate: 0.08, cost: 0 } },
        { country: "Switzerland", code: "CH", fuelPerLitre: 1.95, currency: "CHF", toll: { type: "vignette", rate: 0, cost: 40 } },
      ],
      defaultCountry: "Italy",
      setOn: today,
    },
    // Already answered, so the once-per-trip question does not interrupt
    // the thing being looked at.
    trace: { breadcrumbs: true, asked: true },
  },
  progress: {},
  statistics: {},
  projectState: {},
});

write("journal.json", { version: "1.0", entries: entries });

write("transport.json", {
  version: "1.0",
  items: [{
    id: "TRN-TEST-CAR",
    type: "transport",
    mode: "Car Rental",
    provider: "Test Rentals",
    from: days[0].overnight || "",
    to: days[days.length - 1].overnight || "",
    day: 1,
    dayRange: [1, days.length],
    status: "Booked",
    seats: 5,
    price: { amount: 640, currency: "EUR", per: "trip" },
    participants: [],
    vehicle: { class: "suv", fuelType: "Petrol", litresPer100km: 8.2 },
    schedule: { date: dayOne, departTime: "10:00" },
    planning: { notes: "Test data." },
  }],
});

["accommodation", "activities", "restaurants", "flights", "expenses", "events", "bookings"].forEach(function (name) {
  write(name + ".json", { version: "1.0", items: [] });
});

write("budget.json", { version: "1.0", cap: null, items: [] });

write("weather.json", { version: "1.0", days: [] });

write("project-locations.json", { version: "1.0", locations: [] });

console.log("\n  Built " + to);

console.log("\n  It has no owner yet, so nobody can open it. Next:");

console.log("    node tools/adopt-trip.js " + target + " <username> --share <username>:write --confirm\n");
