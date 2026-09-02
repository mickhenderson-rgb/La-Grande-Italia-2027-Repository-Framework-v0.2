/*
  REMOVE A USER ACCOUNT.

  The app has no admin role, and deliberately still does not get one here.
  A destructive "delete any account" route reachable from the internet is
  a worse problem than the leftover account it would tidy up: it needs a
  privileged role to guard it, that role needs its own login, and that
  login becomes the most valuable credential in the system.

  Whoever can run this already has shell access to the auth directory and
  could edit the files by hand. This is the same authority, with the
  arithmetic done correctly - which hand-editing four JSON files at
  2am is not.

  WHAT IT TOUCHES, in ~/compass-tos-auth/:

    users.json     the account itself
    sessions.json  any session it is signed in with, so removal is immediate
    trips.json     ownership, and any collaborator entry naming it

  It will NOT orphan a trip. An account that owns trips is refused unless
  you say who inherits them, because a trip whose owner does not exist has
  nobody who can share it, rename it or delete it - and no way to get one.

  Node 10.24.1 compatible: it runs on the production host.

  USAGE

    node tools/remove-user.js <username>
    node tools/remove-user.js <username> --give-trips-to <username>
    node tools/remove-user.js <username> --give-trips-to <username> --confirm

  Nothing is written without --confirm. Without it you get the full report
  of what would change, which is the same code path, so the preview cannot
  disagree with the result.
*/
var fs = require("fs");
var path = require("path");

var AUTH_DIR = process.env.AUTH_DIR
  ? path.resolve(process.env.AUTH_DIR)
  : path.join(process.env.HOME || process.env.USERPROFILE || ".", "compass-tos-auth");

var args = process.argv.slice(2);

var target = "";

var heir = "";

var confirm = false;

for (var i = 0; i < args.length; i++) {
  if (args[i] === "--give-trips-to") {
    heir = args[i + 1] || "";

    i += 1;
  } else if (args[i] === "--confirm") {
    confirm = true;
  } else if (args[i].indexOf("--") !== 0 && !target) {
    target = args[i];
  }
}

function die(message) {
  console.error("\n  " + message + "\n");

  process.exit(1);
}

if (!target) {
  die("Usage: node tools/remove-user.js <username> [--give-trips-to <username>] [--confirm]");
}

function load(name, fallback) {
  var file = path.join(AUTH_DIR, name);

  if (!fs.existsSync(file)) {
    return { file: file, data: fallback };
  }

  try {
    return { file: file, data: JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch (error) {
    die("Could not read " + file + ": " + error.message);
  }
}

console.log("\n  Auth directory: " + AUTH_DIR);

if (!fs.existsSync(AUTH_DIR)) {
  die("No auth directory there. Set AUTH_DIR if it lives somewhere else.");
}

var usersFile = load("users.json", { users: [] });

var sessionsFile = load("sessions.json", { sessions: [] });

var tripsFile = load("trips.json", { trips: {} });

// The files hold either a bare array or an object wrapping one, depending
// on when they were written. Both are read, and whichever shape came in is
// the shape written back.
function listOf(holder, key) {
  return Array.isArray(holder) ? holder : (holder && holder[key]) || [];
}

var users = listOf(usersFile.data, "users");

var sessions = listOf(sessionsFile.data, "sessions");

var trips = (tripsFile.data && tripsFile.data.trips) || tripsFile.data || {};

var wanted = String(target).toLowerCase();

var user = users.filter(function (u) {
  return String(u.usernameLower || u.username || "").toLowerCase() === wanted;
})[0];

if (!user) {
  die('No account called "' + target + '". Accounts: ' + users.map(function (u) { return u.username; }).join(", "));
}

// --- What this account owns -----------------------------------------

var owned = Object.keys(trips).filter(function (id) {
  return trips[id] && trips[id].owner === user.id;
});

var shared = Object.keys(trips).filter(function (id) {
  return (trips[id] && trips[id].collaborators ? trips[id].collaborators : []).some(function (c) {
    return c.userId === user.id;
  });
});

var theirSessions = sessions.filter(function (s) { return s.userId === user.id; });

console.log("  Account:        " + user.username + "  (" + user.id + ")");
console.log("  Owns trips:     " + (owned.length ? owned.join(", ") : "none"));
console.log("  Collaborates:   " + (shared.length ? shared.join(", ") : "none"));
console.log("  Live sessions:  " + theirSessions.length);

var heirUser = null;

if (owned.length > 0) {
  if (!heir) {
    die(
      "This account owns " + owned.length + " trip(s): " + owned.join(", ") +
      "\n  A trip whose owner does not exist has nobody who can share, rename or" +
      "\n  delete it, and no way to get one. Re-run with:" +
      "\n\n    --give-trips-to <username>",
    );
  }

  heirUser = users.filter(function (u) {
    return String(u.usernameLower || u.username || "").toLowerCase() === String(heir).toLowerCase();
  })[0];

  if (!heirUser) {
    die('No account called "' + heir + '" to inherit the trips.');
  }

  if (heirUser.id === user.id) {
    die("An account cannot inherit its own trips.");
  }

  console.log("  Trips go to:    " + heirUser.username + "  (" + heirUser.id + ")");
}

// --- The changes ------------------------------------------------------

owned.forEach(function (id) {
  trips[id].owner = heirUser.id;

  // The heir may already be a collaborator on a trip they now own, which
  // would leave them listed twice with conflicting permissions.
  trips[id].collaborators = (trips[id].collaborators || []).filter(function (c) {
    return c.userId !== heirUser.id;
  });
});

Object.keys(trips).forEach(function (id) {
  if (trips[id] && trips[id].collaborators) {
    trips[id].collaborators = trips[id].collaborators.filter(function (c) {
      return c.userId !== user.id;
    });
  }
});

var remainingUsers = users.filter(function (u) { return u.id !== user.id; });

var remainingSessions = sessions.filter(function (s) { return s.userId !== user.id; });

if (remainingUsers.length === 0) {
  die(
    "That is the last account. Removing it would leave the app with no users," +
    "\n  which flips it into first-run mode and lets the next stranger to load" +
    "\n  the page register and claim every trip.",
  );
}

console.log("");
console.log("  Would remove the account, " + theirSessions.length + " session(s), and " +
  shared.length + " collaborator entr" + (shared.length === 1 ? "y" : "ies") + ".");
console.log("  Accounts left:  " + remainingUsers.map(function (u) { return u.username; }).join(", "));

if (!confirm) {
  console.log("\n  Nothing written. Re-run with --confirm to apply.\n");

  process.exit(0);
}

// --- Writing ----------------------------------------------------------

// A backup first, because this is the one directory whose loss locks
// everybody out permanently. Named with the time so repeated runs do not
// overwrite the copy from before the run that went wrong.
var stamp = new Date().toISOString().replace(/[:.]/g, "-");

var backupDir = path.join(AUTH_DIR, "backup-" + stamp);

fs.mkdirSync(backupDir);

["users.json", "sessions.json", "trips.json"].forEach(function (name) {
  var from = path.join(AUTH_DIR, name);

  if (fs.existsSync(from)) {
    fs.writeFileSync(path.join(backupDir, name), fs.readFileSync(from));
  }
});

console.log("\n  Backed up to " + backupDir);

function save(holder, key, list, file) {
  var out = Array.isArray(holder) ? list : Object.assign({}, holder);

  if (!Array.isArray(holder)) {
    out[key] = list;
  }

  fs.writeFileSync(file, JSON.stringify(out, null, 2), "utf8");
}

save(usersFile.data, "users", remainingUsers, usersFile.file);

save(sessionsFile.data, "sessions", remainingSessions, sessionsFile.file);

var tripsOut = tripsFile.data && tripsFile.data.trips ? Object.assign({}, tripsFile.data, { trips: trips }) : trips;

fs.writeFileSync(tripsFile.file, JSON.stringify(tripsOut, null, 2), "utf8");

console.log("  Removed " + user.username + ".");

console.log("\n  Restart the app so it re-reads the files:");

console.log("    pkill -f \"node server.js\"\n");
