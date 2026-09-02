/*
  GIVE A TRIP FOLDER AN OWNER.

  A trip that arrives any way other than through the app - restored from a
  backup, copied in over SSH, or pulled in with the repository - has NO
  OWNERSHIP RECORD. getTripPermission then returns null for everybody, so
  the folder is on disk, the data is intact, and nobody at all can open
  it. There is no message about this; the trip simply is not there.

  claimUnownedTrips() exists but only runs for the FIRST user ever
  registered, which is a one-time bootstrap and no help afterwards.

  As with remove-user.js, this stays a command and not a route: assigning
  ownership of somebody's trip is not a thing that should be reachable
  from the internet, and whoever has shell access can already edit
  trips.json by hand. This just does the arithmetic properly.

  Node 10.24.1 compatible: it runs on the production host.

  USAGE

    node tools/adopt-trip.js <folder> <username>
    node tools/adopt-trip.js <folder> <username> --share <username>:write
    node tools/adopt-trip.js <folder> <username> --share <username>:write --confirm

  Nothing is written without --confirm.
*/
var fs = require("fs");
var path = require("path");

var ROOT = path.resolve(__dirname, "..");

var AUTH_DIR = process.env.AUTH_DIR
  ? path.resolve(process.env.AUTH_DIR)
  : path.join(process.env.HOME || process.env.USERPROFILE || ".", "compass-tos-auth");

var args = process.argv.slice(2);

var folder = "";

var owner = "";

var shares = [];

var confirm = false;

for (var i = 0; i < args.length; i++) {
  if (args[i] === "--share") {
    shares.push(args[i + 1] || "");

    i += 1;
  } else if (args[i] === "--confirm") {
    confirm = true;
  } else if (args[i].indexOf("--") !== 0) {
    if (!folder) {
      folder = args[i];
    } else if (!owner) {
      owner = args[i];
    }
  }
}

function die(message) {
  console.error("\n  " + message + "\n");

  process.exit(1);
}

if (!folder || !owner) {
  die("Usage: node tools/adopt-trip.js <folder> <username> [--share <username>:write] [--confirm]");
}

var projectDir = path.join(ROOT, "data", "projects", folder);

if (!fs.existsSync(projectDir)) {
  die("No trip folder at " + projectDir);
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

var tripsFile = load("trips.json", { trips: {} });

var users = Array.isArray(usersFile.data) ? usersFile.data : usersFile.data.users || [];

var trips = (tripsFile.data && tripsFile.data.trips) || tripsFile.data || {};

function findUser(name) {
  return users.filter(function (u) {
    return String(u.usernameLower || u.username || "").toLowerCase() === String(name).toLowerCase();
  })[0];
}

var ownerUser = findUser(owner);

if (!ownerUser) {
  die('No account called "' + owner + '". Accounts: ' + users.map(function (u) { return u.username; }).join(", "));
}

var collaborators = [];

for (var s = 0; s < shares.length; s++) {
  var bits = shares[s].split(":");

  var who = findUser(bits[0]);

  if (!who) {
    die('No account called "' + bits[0] + '" to share with.');
  }

  var permission = bits[1] || "write";

  if (["write", "read", "guest"].indexOf(permission) === -1) {
    die('Permission must be write, read or guest - got "' + permission + '".');
  }

  if (who.id === ownerUser.id) {
    die("The owner does not need to be a collaborator as well.");
  }

  collaborators.push({ userId: who.id, permission: permission, addedAt: new Date().toISOString(), username: who.username });
}

var existing = trips[folder];

console.log("  Trip folder:    " + folder);

console.log("  Currently:      " + (existing ? "owned by " + existing.owner : "NO OWNER - nobody can open it"));

console.log("  Owner:          " + ownerUser.username + "  (" + ownerUser.id + ")");

console.log("  Shared with:    " + (collaborators.length
  ? collaborators.map(function (c) { return c.username + " (" + c.permission + ")"; }).join(", ")
  : "nobody"));

if (existing && existing.owner !== ownerUser.id) {
  console.log("\n  NOTE: this trip already has a different owner. Adopting it will");

  console.log("  take it from them.");
}

if (!confirm) {
  console.log("\n  Nothing written. Re-run with --confirm to apply.\n");

  process.exit(0);
}

var stamp = new Date().toISOString().replace(/[:.]/g, "-");

var backup = path.join(AUTH_DIR, "backup-" + stamp);

fs.mkdirSync(backup);

if (fs.existsSync(tripsFile.file)) {
  fs.writeFileSync(path.join(backup, "trips.json"), fs.readFileSync(tripsFile.file));
}

trips[folder] = {
  owner: ownerUser.id,
  // username is dropped: trips.json stores ids, and a stale copy of a
  // name is a thing that goes wrong later.
  collaborators: collaborators.map(function (c) {
    return { userId: c.userId, permission: c.permission, addedAt: c.addedAt };
  }),
  createdAt: (existing && existing.createdAt) || new Date().toISOString(),
};

var out = tripsFile.data && tripsFile.data.trips
  ? Object.assign({}, tripsFile.data, { trips: trips })
  : trips;

fs.writeFileSync(tripsFile.file, JSON.stringify(out, null, 2), "utf8");

console.log("\n  Backed up to " + backup);

console.log("  " + folder + " now belongs to " + ownerUser.username + ".");

console.log("\n  Restart the app so it re-reads the file:");

console.log("    pkill -f \"node server.js\"\n");
