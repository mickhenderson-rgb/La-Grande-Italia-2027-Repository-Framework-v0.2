/*
  WHAT TRIPS ARE ON THIS SERVER, AND REMOVING THE ONES THAT ARE NOT.

  The app has no way to delete a trip and no way to see the ones you
  cannot open. Five folders accumulate, two of them are dead copies, one
  has no owner so it is invisible, and nothing anywhere will tell you
  which is which.

  This lists them with everything needed to decide - owner, who else can
  open it, how many days, how much journal is in it, when it was last
  touched - and removes the ones you say to.

  REMOVING DOES NOT DELETE. The folder is MOVED to data/projects-removed/
  with a timestamp. A trip is somebody's record of a holiday, this runs
  against live data on a server, and "rm -rf the wrong argument" is a
  thing that happens to everyone eventually. Getting it back is a mv;
  getting it back from a delete is a restore from backup, if there is one.

  When you are certain, the folder is yours to delete by hand.

  Like the other two tools this stays a command and not a route: deleting
  trips is not a thing that should be reachable from the internet, and
  whoever has shell access can already do all of this by hand. This just
  does the arithmetic, and refuses the mistakes.

  Node 10.24.1 compatible: it runs on the production host.

  USAGE

    node tools/trips.js
    node tools/trips.js remove <folder>
    node tools/trips.js remove <folder> --confirm
    node tools/trips.js restore <folder-in-projects-removed> --confirm
*/
var fs = require("fs");
var path = require("path");

var ROOT = path.resolve(__dirname, "..");

var PROJECTS = path.join(ROOT, "data", "projects");

var REMOVED = path.join(ROOT, "data", "projects-removed");

var AUTH_DIR = process.env.AUTH_DIR
  ? path.resolve(process.env.AUTH_DIR)
  : path.join(process.env.HOME || process.env.USERPROFILE || ".", "compass-tos-auth");

var args = process.argv.slice(2);

var confirm = args.indexOf("--confirm") !== -1;

// The first plain word is the COMMAND, whatever it is - not "a command
// if I recognise it, otherwise a folder name". That version turned a
// mistyped "delete" into a silent listing, which looks exactly like a
// tool that did nothing wrong.
var positional = args.filter(function (a) { return a.indexOf("--") !== 0; });

var command = positional.length > 0 ? positional[0] : "list";

var folder = positional[1] || "";

function die(message) {
  console.error("\n  " + message + "\n");

  process.exit(1);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return fallback;
  }
}

var usersFile = path.join(AUTH_DIR, "users.json");

var tripsFile = path.join(AUTH_DIR, "trips.json");

var usersRaw = readJson(usersFile, { users: [] });

var tripsRaw = readJson(tripsFile, { trips: {} });

var users = Array.isArray(usersRaw) ? usersRaw : usersRaw.users || [];

var trips = (tripsRaw && tripsRaw.trips) || tripsRaw || {};

function nameOf(userId) {
  for (var i = 0; i < users.length; i++) {
    if (users[i].id === userId) {
      return users[i].username;
    }
  }

  return "(a deleted account)";
}

// Size and modification time of a folder, one level deep plus
// destinations/ - which is every shape a trip folder actually has.
function measure(dir) {
  var bytes = 0;

  var newest = 0;

  function look(where) {
    var names;

    try {
      names = fs.readdirSync(where);
    } catch (error) {
      return;
    }

    names.forEach(function (name) {
      var full = path.join(where, name);

      var stat;

      try {
        stat = fs.statSync(full);
      } catch (error) {
        return;
      }

      if (stat.isDirectory()) {
        look(full);

        return;
      }

      bytes += stat.size;

      newest = Math.max(newest, stat.mtimeMs);
    });
  }

  look(dir);

  return { bytes: bytes, newest: newest };
}

function describe(name) {
  var dir = path.join(PROJECTS, name);

  var project = readJson(path.join(dir, "project.json"), null);

  var journey = readJson(path.join(dir, "journey.json"), null);

  var journal = readJson(path.join(dir, "journal.json"), null);

  var size = measure(dir);

  var photos = 0;

  var notes = 0;

  ((journal && journal.entries) || []).forEach(function (entry) {
    photos += (entry.photos || []).length;

    if (entry.notes && String(entry.notes).trim()) {
      notes += 1;
    }
  });

  var owned = trips[name];

  return {
    name: name,
    title: (project && project.project && project.project.name) || "(no project.json)",
    days: journey && Array.isArray(journey.days) ? journey.days.length : 0,
    photos: photos,
    notes: notes,
    owner: owned ? nameOf(owned.owner) : null,
    sharedWith: owned
      ? (owned.collaborators || []).map(function (c) { return nameOf(c.userId) + " (" + c.permission + ")"; })
      : [],
    kb: Math.round(size.bytes / 1024),
    touched: size.newest ? new Date(size.newest).toISOString().slice(0, 10) : "-",
  };
}

function listFolders(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(function (e) { return e.isDirectory(); })
      .map(function (e) { return e.name; });
  } catch (error) {
    return [];
  }
}

// --- list -------------------------------------------------------------

if (command === "list") {
  var folders = listFolders(PROJECTS);

  if (folders.length === 0) {
    die("No trips in " + PROJECTS);
  }

  console.log("");

  folders.forEach(function (name) {
    var t = describe(name);

    console.log("  " + t.name);

    console.log("      " + t.title);

    console.log("      " + t.days + " days, " + t.photos + " photos, " + t.notes + " days with notes, " +
      t.kb + "KB, last touched " + t.touched);

    if (!t.owner) {
      console.log("      NO OWNER - nobody can open this. Fix with tools/adopt-trip.js");
    } else {
      console.log("      owner " + t.owner + (t.sharedWith.length ? ", shared with " + t.sharedWith.join(", ") : ""));
    }

    console.log("");
  });

  // An ownership record whose folder is gone. Harmless, but it is why a
  // trip can be listed as shared with someone and not be there.
  var dangling = Object.keys(trips).filter(function (name) {
    return folders.indexOf(name) === -1;
  });

  if (dangling.length > 0) {
    console.log("  Ownership records with no folder: " + dangling.join(", "));

    console.log("  (harmless - the trip is gone, the record is not)\n");
  }

  var archived = listFolders(REMOVED);

  if (archived.length > 0) {
    console.log("  Removed and recoverable: " + archived.join(", ") + "\n");
  }

  process.exit(0);
}

// --- remove -----------------------------------------------------------

if (command === "remove") {
  if (!folder) {
    die("Usage: node tools/trips.js remove <folder> [--confirm]");
  }

  var from = path.join(PROJECTS, folder);

  if (!fs.existsSync(from)) {
    die("No trip at " + from + "\n  Trips here: " + listFolders(PROJECTS).join(", "));
  }

  var it = describe(folder);

  console.log("\n  " + it.name + "  —  " + it.title);

  console.log("  " + it.days + " days, " + it.photos + " photos, " + it.notes + " days with notes, " +
    it.kb + "KB, last touched " + it.touched);

  console.log("  " + (it.owner ? "owner " + it.owner : "NO OWNER"));

  // The things that make a trip somebody's rather than a leftover.
  if (it.photos > 0 || it.notes > 0) {
    console.log("\n  THIS TRIP HAS A JOURNAL IN IT: " + it.photos + " photos and " +
      it.notes + " days of notes.");

    console.log("  That is the part nobody can write again.");
  }

  console.log("\n  It will be MOVED to data/projects-removed/, not deleted.");

  if (!confirm) {
    console.log("\n  Nothing moved. Re-run with --confirm.\n");

    process.exit(0);
  }

  var stamp = new Date().toISOString().replace(/[:.]/g, "-");

  fs.mkdirSync(REMOVED, { recursive: true });

  var to = path.join(REMOVED, folder + "--" + stamp);

  // A rename, not a copy-and-delete: one atomic operation, nothing
  // half-done if it fails, and no recursive delete to get wrong. It also
  // sidesteps Node 10 having no recursive rmdir at all.
  try {
    fs.renameSync(from, to);
  } catch (error) {
    die("Could not move it: " + error.message);
  }

  // The ownership record goes too, or the trip shows as shared with
  // people who cannot open it.
  if (trips[folder]) {
    fs.mkdirSync(path.join(AUTH_DIR, "backup-" + stamp), { recursive: true });

    if (fs.existsSync(tripsFile)) {
      fs.writeFileSync(path.join(AUTH_DIR, "backup-" + stamp, "trips.json"), fs.readFileSync(tripsFile));
    }

    delete trips[folder];

    var out = tripsRaw && tripsRaw.trips ? Object.assign({}, tripsRaw, { trips: trips }) : trips;

    fs.writeFileSync(tripsFile, JSON.stringify(out, null, 2), "utf8");

    console.log("\n  Ownership record removed (trips.json backed up).");
  }

  console.log("\n  Moved to " + to);

  console.log("\n  To put it back:");

  console.log("    node tools/trips.js restore " + path.basename(to) + " --confirm");

  console.log("\n  When you are certain, delete it yourself:");

  console.log("    rm -rf " + to);

  console.log("\n  Restart the app:");

  console.log("    pkill -f \"node server.js\"\n");

  process.exit(0);
}

// --- restore ----------------------------------------------------------

if (command === "restore") {
  if (!folder) {
    die("Usage: node tools/trips.js restore <folder-in-projects-removed> [--confirm]");
  }

  var back = path.join(REMOVED, folder);

  if (!fs.existsSync(back)) {
    die("Nothing removed by that name.\n  Removed: " + (listFolders(REMOVED).join(", ") || "(none)"));
  }

  // Everything after the timestamp separator is what it was called.
  var original = folder.split("--")[0];

  var target = path.join(PROJECTS, original);

  if (fs.existsSync(target)) {
    die("A trip called " + original + " is already there. Move or rename it first.");
  }

  console.log("\n  Restoring " + folder + "  ->  " + original);

  if (!confirm) {
    console.log("\n  Nothing moved. Re-run with --confirm.\n");

    process.exit(0);
  }

  fs.renameSync(back, target);

  console.log("\n  Back in place.");

  console.log("\n  It has no ownership record any more, so give it one:");

  console.log("    node tools/adopt-trip.js " + original + " <username> --confirm\n");

  process.exit(0);
}

die('Unknown command "' + command + '". Try: list, remove, restore.');
