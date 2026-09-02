/*
=========================================================

COMPASS-TOS

Local Server

Version 1.0.0

Build 22

Plain Node.js, zero dependencies - matches the project's
"no frameworks" principle. Two jobs:

1. Serve the app itself (replaces Live Server) so it runs
   over http:// instead of file://, which fetch() requires.

2. Provide ONE api route - PUT /api/data/:project/:collection -
   that writes the request body back to the matching JSON
   file on disk. This is what makes changes in the app
   actually persist across a refresh or restart, which the
   app could not do on its own (it could only read files,
   never write them).

Run with: node server.js
Then open: http://localhost:8080

=========================================================
*/

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 8080;

const ROOT = __dirname;

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

// Names in, participants out. The ids are sequential because they end up
// in every booking's participants array, where they want to be readable.
//
// Colours are FIXED hexes rather than theme tokens: they identify a
// person, not a state, so they have to mean the same thing in both
// themes. Kept in step with Participants.COLOURS.
function buildParticipants(names) {
  var palette = ["#2f6fb3", "#b3572f", "#3f8f5a", "#8a4f9e", "#b3902f", "#4a6b8a", "#a34f6b", "#5a7a3f"];

  if (!Array.isArray(names)) {
    return [];
  }

  return names
    .map(function (name) {
      return String(name || "").trim();
    })
    .filter(Boolean)
    .slice(0, 30)
    .map(function (name, index) {
      return {
        id: "p" + (index + 1),
        name: name.slice(0, 80),
        dob: "",
        // Null, not [1, lastDay]: "whole trip" has to survive the trip
        // getting longer, and a stored range would quietly stop covering
        // the end of it.
        dayRange: null,
        linkedUser: "",
        colour: palette[index % palette.length],
      };
    });
}

function safeName(value) {
  return /^[a-zA-Z0-9_-]+$/.test(value);
}

function sendJSON(res, statusCode, payload) {
  const body = JSON.stringify(payload);

  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });

  res.end(body);
}

// Largest legitimate payload is a base64 photo upload (the client resizes
// to ~1600px/80% JPEG first, and handleUpload enforces its own 8MB cap on
// the decoded image) - 10MB leaves headroom for the base64 inflation and
// the JSON envelope. Anything beyond that is cut off at the socket rather
// than buffered, so a huge request can't drive the process out of memory.
const MAX_BODY_BYTES = 10 * 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];

    let total = 0;

    req.on("data", (chunk) => {
      total += chunk.length;

      if (total > MAX_BODY_BYTES) {
        req.destroy();

        reject(Object.assign(new Error("Request body too large."), { code: "BODY_TOO_LARGE" }));

        return;
      }

      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));

    req.on("error", reject);
  });
}

async function handleDataWrite(req, res, projectId, collection) {
  if (!safeName(projectId) || !safeName(collection)) {
    return sendJSON(res, 400, { error: "Invalid project or collection name." });
  }

  const filePath = path.join(ROOT, "data", "projects", projectId, `${collection}.json`);

  if (!filePath.startsWith(path.join(ROOT, "data", "projects"))) {
    return sendJSON(res, 400, { error: "Invalid path." });
  }

  let body;

  try {
    const raw = await readBody(req);

    body = JSON.parse(raw);
  } catch (error) {
    return sendJSON(res, 400, { error: "Request body must be valid JSON." });
  }

  try {
    fs.writeFileSync(filePath, JSON.stringify(body, null, 2), "utf8");

    console.log(`[saved] ${projectId}/${collection}.json`);

    return sendJSON(res, 200, { ok: true, saved: `${collection}.json` });
  } catch (error) {
    console.error(`[save failed] ${projectId}/${collection}.json`, error.message);

    return sendJSON(res, 500, { error: "Could not write file." });
  }
}

// Collections that share the { items: [...] } shape and support atomic
// per-item operations, with the id prefix used for newly created items.
const ITEM_COLLECTIONS = {
  accommodation: "ACC",
  activities: "ACT",
  transport: "TRN",
  restaurants: "RST",
  expenses: "EXP",
  flights: "FLT",
};

function itemsFilePath(projectId, collection) {
  return path.join(ROOT, "data", "projects", projectId, `${collection}.json`);
}

function readItemsFileSync(projectId, collection) {
  const filePath = itemsFilePath(projectId, collection);

  // Trips created before a collection existed (or created through an older
  // path) can be missing one of these files entirely, which used to 500 the
  // very first add. Auto-create it with the standard empty shape instead.
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ version: "2.0", schema: "planning-item", items: [] }, null, 2), "utf8");
  }

  const raw = fs.readFileSync(filePath, "utf8");

  const data = JSON.parse(raw);

  if (!Array.isArray(data.items)) {
    data.items = [];
  }

  return { filePath, data };
}

async function handleItemAdd(req, res, projectId, collection) {
  if (!safeName(projectId) || !ITEM_COLLECTIONS[collection]) {
    return sendJSON(res, 400, { error: "Invalid project or collection." });
  }

  let body;

  try {
    body = JSON.parse(await readBody(req));
  } catch (error) {
    return sendJSON(res, 400, { error: "Request body must be valid JSON." });
  }

  try {
    // Synchronous read-modify-write, no await in between: atomic under
    // Node's single-threaded event loop, same guarantee as Journal.
    // Server generates the id here too - client-side "scan for max + 1"
    // would itself race if two people add at the same instant.
    const { filePath, data } = readItemsFileSync(projectId, collection);

    const item = Object.assign({}, body, { id: newId(ITEM_COLLECTIONS[collection]) });

    data.items.push(item);

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");

    console.log(`[${collection}] added item ${item.id}`);

    return sendJSON(res, 200, { ok: true, item });
  } catch (error) {
    console.error(`[${collection} add failed]`, error.message);

    return sendJSON(res, 500, { error: "Could not save the item." });
  }
}

async function handleItemUpdate(req, res, projectId, collection, itemId) {
  if (!safeName(projectId) || !ITEM_COLLECTIONS[collection]) {
    return sendJSON(res, 400, { error: "Invalid project or collection." });
  }

  let body;

  try {
    body = JSON.parse(await readBody(req));
  } catch (error) {
    return sendJSON(res, 400, { error: "Request body must be valid JSON." });
  }

  try {
    const { filePath, data } = readItemsFileSync(projectId, collection);

    const item = data.items.find((i) => i.id === itemId);

    if (!item) {
      return sendJSON(res, 404, { error: "Item not found." });
    }

    // Shallow merge - only touches this one item, regardless of what
    // else may have been added or changed elsewhere in the file since
    // the client last loaded it.
    Object.assign(item, body, { id: itemId });

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");

    console.log(`[${collection}] updated item ${itemId}`);

    return sendJSON(res, 200, { ok: true, item });
  } catch (error) {
    console.error(`[${collection} update failed]`, error.message);

    return sendJSON(res, 500, { error: "Could not update the item." });
  }
}

function handleItemRemove(req, res, projectId, collection, itemId) {
  if (!safeName(projectId) || !ITEM_COLLECTIONS[collection]) {
    return sendJSON(res, 400, { error: "Invalid project or collection." });
  }

  try {
    const { filePath, data } = readItemsFileSync(projectId, collection);

    data.items = data.items.filter((i) => i.id !== itemId);

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");

    console.log(`[${collection}] removed item ${itemId}`);

    return sendJSON(res, 200, { ok: true });
  } catch (error) {
    console.error(`[${collection} remove failed]`, error.message);

    return sendJSON(res, 500, { error: "Could not remove the item." });
  }
}

function handleAccommodationSelect(req, res, projectId, itemId) {
  if (!safeName(projectId)) {
    return sendJSON(res, 400, { error: "Invalid project." });
  }

  try {
    const { filePath, data } = readItemsFileSync(projectId, "accommodation");

    const target = data.items.find((i) => i.id === itemId);

    if (!target) {
      return sendJSON(res, 404, { error: "Item not found." });
    }

    data.items.forEach((item) => {
      if (item.destination === target.destination) {
        item.selected = item.id === itemId;

        if (item.id === itemId && item.status === "Research") {
          item.status = "Selected";
        }
      }
    });

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");

    console.log(`[accommodation] selected ${itemId}`);

    return sendJSON(res, 200, { ok: true });
  } catch (error) {
    console.error("[accommodation select failed]", error.message);

    return sendJSON(res, 500, { error: "Could not update selection." });
  }
}

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

async function handleUpload(req, res, projectId) {
  if (!safeName(projectId)) {
    return sendJSON(res, 400, { error: "Invalid project name." });
  }

  let body;

  try {
    const raw = await readBody(req);

    if (Buffer.byteLength(raw, "utf8") > MAX_UPLOAD_BYTES) {
      return sendJSON(res, 413, { error: "File too large." });
    }

    body = JSON.parse(raw);
  } catch (error) {
    return sendJSON(res, 400, { error: "Request body must be valid JSON." });
  }

  const dataUrl = body.dataUrl || "";

  const match = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/.exec(dataUrl);

  if (!match) {
    return sendJSON(res, 400, { error: "Expected a base64 image data URL." });
  }

  const extension = match[1] === "jpg" ? "jpeg" : match[1];

  const buffer = Buffer.from(match[2], "base64");

  if (buffer.length > MAX_UPLOAD_BYTES) {
    return sendJSON(res, 413, { error: "File too large." });
  }

  const uploadsDir = path.join(ROOT, "data", "projects", projectId, "uploads");

  try {
    fs.mkdirSync(uploadsDir, { recursive: true });

    const filename = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

    fs.writeFileSync(path.join(uploadsDir, filename), buffer);

    const url = `data/projects/${projectId}/uploads/${filename}`;

    console.log(`[uploaded] ${url} (${(buffer.length / 1024).toFixed(0)} KB)`);

    return sendJSON(res, 200, { ok: true, url });
  } catch (error) {
    console.error("[upload failed]", error.message);

    return sendJSON(res, 500, { error: "Could not save the photo." });
  }
}

function journalFilePath(projectId) {
  return path.join(ROOT, "data", "projects", projectId, "journal.json");
}

function readJournalSync(projectId) {
  const filePath = journalFilePath(projectId);

  const raw = fs.readFileSync(filePath, "utf8");

  return { filePath, journal: JSON.parse(raw) };
}

function findOrCreateEntrySync(journal, day) {
  let entry = journal.entries.find((e) => e.day === day);

  if (!entry) {
    entry = {
      day,
      notes: "",
      location: { name: "", address: "" },
      checklist: [],
      photos: [],
    };

    journal.entries.push(entry);
  }

  return entry;
}

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function handleJournalPhotoAdd(req, res, projectId, day) {
  if (!safeName(projectId)) {
    return sendJSON(res, 400, { error: "Invalid project name." });
  }

  let body;

  try {
    body = JSON.parse(await readBody(req));
  } catch (error) {
    return sendJSON(res, 400, { error: "Request body must be valid JSON." });
  }

  if (!body.url) {
    return sendJSON(res, 400, { error: "A photo url is required." });
  }

  try {
    // Synchronous read-modify-write, no await in between: this whole block
    // runs as one atomic unit on Node's single-threaded event loop, so two
    // near-simultaneous requests can never interleave and lose each other's
    // photo, unlike a full-file overwrite sent from a possibly-stale browser tab.
    const { filePath, journal } = readJournalSync(projectId);

    const entry = findOrCreateEntrySync(journal, day);

    const photo = {
      id: newId("PHT"),
      url: body.url,
      // A second, print-quality copy of the same photo. The app never
      // shows it - loading a dozen 3200px images on mobile data would be
      // painful - it exists purely so an export has the pixels a printed
      // page needs. Optional: a photo added before archives existed, or
      // whose larger upload failed, simply has none, and the export falls
      // back to the display copy.
      archiveUrl: body.archiveUrl || "",
      caption: body.caption || "",
      // Where and when the photo was taken, read out of its own EXIF by
      // the browser before the resize discarded it. Both optional: a
      // screenshot, a picture someone sent you, or a phone with location
      // switched off simply has neither.
      location: sanitisePoint(body.location),
      takenAt: typeof body.takenAt === "string" ? body.takenAt.slice(0, 19) : "",
      addedBy: req.authUser || "",
    };

    entry.photos.push(photo);

    fs.writeFileSync(filePath, JSON.stringify(journal, null, 2), "utf8");

    console.log(`[journal] added photo to day ${day}`);

    return sendJSON(res, 200, { ok: true, photo, entry });
  } catch (error) {
    console.error("[journal photo add failed]", error.message);

    return sendJSON(res, 500, { error: "Could not save the photo entry." });
  }
}

// A coordinate pair from a browser, trusted no further than its shape.
//
// Written once and used by both the photo entry and the breadcrumb
// endpoint, so neither can drift into accepting something the other
// rejects.
function sanitisePoint(point) {
  if (!point || typeof point !== "object") {
    return null;
  }

  var lat = Number(point.lat);

  var lng = Number(point.lng);

  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }

  if (lat === 0 && lng === 0) {
    return null;
  }

  return {
    lat: Math.round(lat * 1e5) / 1e5,
    lng: Math.round(lng * 1e5) / 1e5,
    // Free text from a client is not allowed to become a field name
    // downstream, so it is constrained to the two sources that exist.
    source: point.source === "device" ? "device" : "photo",
  };
}

async function handleJournalPhotoRemove(req, res, projectId, day, photoId) {
  if (!safeName(projectId)) {
    return sendJSON(res, 400, { error: "Invalid project name." });
  }

  try {
    const { filePath, journal } = readJournalSync(projectId);

    const entry = journal.entries.find((e) => e.day === day);

    if (entry) {
      entry.photos = entry.photos.filter((p) => p.id !== photoId);
    }

    fs.writeFileSync(filePath, JSON.stringify(journal, null, 2), "utf8");

    console.log(`[journal] removed photo ${photoId} from day ${day}`);

    return sendJSON(res, 200, { ok: true });
  } catch (error) {
    console.error("[journal photo remove failed]", error.message);

    return sendJSON(res, 500, { error: "Could not remove the photo." });
  }
}

async function handleJournalChecklistAdd(req, res, projectId, day) {
  if (!safeName(projectId)) {
    return sendJSON(res, 400, { error: "Invalid project name." });
  }

  let body;

  try {
    body = JSON.parse(await readBody(req));
  } catch (error) {
    return sendJSON(res, 400, { error: "Request body must be valid JSON." });
  }

  if (!body.text) {
    return sendJSON(res, 400, { error: "Checklist text is required." });
  }

  try {
    const { filePath, journal } = readJournalSync(projectId);

    const entry = findOrCreateEntrySync(journal, day);

    const item = { id: newId("CHK"), text: body.text, checked: false, addedBy: req.authUser || "" };

    entry.checklist.push(item);

    fs.writeFileSync(filePath, JSON.stringify(journal, null, 2), "utf8");

    console.log(`[journal] added checklist item to day ${day}`);

    return sendJSON(res, 200, { ok: true, item, entry });
  } catch (error) {
    console.error("[journal checklist add failed]", error.message);

    return sendJSON(res, 500, { error: "Could not save the checklist item." });
  }
}

async function handleJournalChecklistToggle(req, res, projectId, day, itemId) {
  if (!safeName(projectId)) {
    return sendJSON(res, 400, { error: "Invalid project name." });
  }

  let body;

  try {
    body = JSON.parse(await readBody(req));
  } catch (error) {
    return sendJSON(res, 400, { error: "Request body must be valid JSON." });
  }

  try {
    const { filePath, journal } = readJournalSync(projectId);

    const entry = journal.entries.find((e) => e.day === day);

    const item = entry && entry.checklist.find((i) => i.id === itemId);

    if (item) {
      item.checked = !!body.checked;
    }

    fs.writeFileSync(filePath, JSON.stringify(journal, null, 2), "utf8");

    return sendJSON(res, 200, { ok: true });
  } catch (error) {
    console.error("[journal checklist toggle failed]", error.message);

    return sendJSON(res, 500, { error: "Could not update the checklist item." });
  }
}

async function handleJournalChecklistRemove(req, res, projectId, day, itemId) {
  if (!safeName(projectId)) {
    return sendJSON(res, 400, { error: "Invalid project name." });
  }

  try {
    const { filePath, journal } = readJournalSync(projectId);

    const entry = journal.entries.find((e) => e.day === day);

    if (entry) {
      entry.checklist = entry.checklist.filter((i) => i.id !== itemId);
    }

    fs.writeFileSync(filePath, JSON.stringify(journal, null, 2), "utf8");

    console.log(`[journal] removed checklist item ${itemId} from day ${day}`);

    return sendJSON(res, 200, { ok: true });
  } catch (error) {
    console.error("[journal checklist remove failed]", error.message);

    return sendJSON(res, 500, { error: "Could not remove the checklist item." });
  }
}

// SEC-002: the static server is an ALLOWLIST, not "serve anything that
// isn't explicitly blocked". Previously any file under ROOT was reachable
// - Archived code/, planning .md docs, package.json, .gitignore, the
// .code-workspace file. Denylisting means every new file added to the repo
// is public by default and someone has to remember to block it; an
// allowlist inverts that, which is the safer default.
//
// /data/projects/ IS listed, but it is NOT unauthenticated: every request
// under it is gated earlier in the router by session + trip permission
// (401/403 for anyone without access, and guests get a redacted copy).
// That gate CHECKS access and then falls through to here to actually read
// the file off disk, so this entry is required for a permitted user to
// load their own trip - omitting it 404s legitimate reads. Note the
// sibling /data/auth/ is refused outright above and is not reachable
// through this entry.
const PUBLIC_FILES = new Set(["/index.html", "/manifest.webmanifest", "/service-worker.js"]);

// /components/ removed with the directory itself in v1.22.0 - it and the
// 14 files in assets/js/ were the pre-app/ implementation, last touched in
// July and loaded by nothing since.
const PUBLIC_DIRS = ["/app/", "/core/", "/assets/", "/data/projects/"];

function isPubliclyServable(urlPath) {
  if (PUBLIC_FILES.has(urlPath)) {
    return true;
  }

  return PUBLIC_DIRS.some((dir) => urlPath.startsWith(dir));
}

function serveStaticFile(req, res) {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);

  if (urlPath === "/") {
    urlPath = "/index.html";
  }

  // SECURITY: never serve the credential store over HTTP, whatever the
  // path looks like. This used to be reachable unauthenticated - password
  // hashes, live session tokens and unused invite tokens were all public.
  // AUTH_DIR now lives outside ROOT so this can't be hit at all, but the
  // check stays as defence in depth: if AUTH_DIR is ever moved back under
  // the served root, or a new secrets directory appears, this still blocks
  // it. Checked BEFORE the traversal check so encoded variants can't slip
  // past. Note both the leading-slash form and any nested occurrence are
  // rejected, and the comparison is case-insensitive because Windows and
  // macOS filesystems are.
  const lowerPath = urlPath.toLowerCase();

  if (
    lowerPath.startsWith("/data/auth/") ||
    lowerPath === "/data/auth" ||
    lowerPath.includes("/data/auth/")
  ) {
    res.writeHead(403, { "Content-Type": "text/plain" });

    return res.end("Forbidden");
  }

  const filePath = path.normalize(path.join(ROOT, urlPath));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);

    return res.end("Forbidden");
  }

  // SEC-002 allowlist gate. Checked AFTER normalisation so that a path
  // like /app/../package.json is judged on where it actually lands, not
  // on how it was spelled. 404 rather than 403 so this doesn't confirm
  // whether a given file exists.
  const normalisedUrlPath = "/" + path.relative(ROOT, filePath).split(path.sep).join("/");

  if (!isPubliclyServable(normalisedUrlPath)) {
    res.writeHead(404, { "Content-Type": "text/plain" });

    return res.end("Not found: " + urlPath);
  }

  // Second belt: resolve the real path and refuse anything that lands
  // inside the auth directory, regardless of how the URL was spelled.
  if (path.resolve(filePath).toLowerCase().startsWith(path.resolve(AUTH_DIR).toLowerCase())) {
    res.writeHead(403, { "Content-Type": "text/plain" });

    return res.end("Forbidden");
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain" });

      return res.end("Not found: " + urlPath);
    }

    const ext = path.extname(filePath).toLowerCase();

    const headers = { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" };

    // service-worker.js and index.html must always be revalidated - these
    // are the two files that control whether updates ever reach a
    // returning visitor. Letting the browser's own HTTP cache hold onto
    // a stale copy of either one defeats the whole update mechanism.
    if (urlPath === "/service-worker.js" || urlPath === "/index.html") {
      headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
    } else {
      // Everything else was previously sent with NO cache headers at all,
      // which lets the browser apply heuristic caching and serve a very
      // old copy without asking. That stale copy could then be baked into
      // the service worker's versioned cache and pinned there (a real
      // incident - see the freshRequest note in service-worker.js).
      // "no-cache" still allows storage, but forces revalidation before
      // reuse, so the browser can never silently serve something stale.
      headers["Cache-Control"] = "no-cache";
    }

    res.writeHead(200, headers);

    res.end(data);
  });
}

function getConfiguredUsers() {
  const users = [];

  if (process.env.AUTH_USER && process.env.AUTH_PASS) {
    users.push({ user: process.env.AUTH_USER, pass: process.env.AUTH_PASS });
  }

  let i = 2;

  while (process.env[`AUTH_USER_${i}`] && process.env[`AUTH_PASS_${i}`]) {
    users.push({ user: process.env[`AUTH_USER_${i}`], pass: process.env[`AUTH_PASS_${i}`] });

    i++;
  }

  return users;
}

function getAuthenticatedUser(req) {
  const users = getConfiguredUsers();

  if (users.length === 0) {
    console.warn("[auth] No AUTH_USER/AUTH_PASS configured - site is running with NO password protection.");

    return "anonymous";
  }

  const header = req.headers["authorization"] || "";

  const [scheme, encoded] = header.split(" ");

  if (scheme !== "Basic" || !encoded) {
    return null;
  }

  const decoded = Buffer.from(encoded, "base64").toString("utf8");

  const separatorIndex = decoded.indexOf(":");

  const providedUser = decoded.slice(0, separatorIndex);

  const providedPass = decoded.slice(separatorIndex + 1);

  const match = users.find((u) => u.user === providedUser && u.pass === providedPass);

  return match ? match.user : null;
}

function isAuthorized(req) {
  return !!getAuthenticatedUser(req);
}

function requireAuth(res) {
  res.writeHead(401, {
    "Content-Type": "text/plain",
    "WWW-Authenticate": 'Basic realm="COMPASS-TOS", charset="UTF-8"',
  });

  res.end("Authentication required.");
}

// =========================================================
// Build 47 - User accounts, sessions and trip ownership.
//
// Zero dependencies: passwords are hashed with the built-in
// crypto.scrypt (a strong, deliberately-slow KDF - the
// no-dependency stand-in for bcrypt), and users / sessions /
// invites / trip-ownership all live as JSON files, the same
// "JSON stores facts" model as the rest of the app.
//
// Login is by username; email is collected at sign-up and
// used to tie invites to a specific person.
// =========================================================

// SECURITY: the credential store lives OUTSIDE the directory the static
// file server serves from. It used to be ROOT/data/auth, which meant
// serveStaticFile() happily handed out users.json (password hashes),
// sessions.json (live session tokens - full account takeover),
// invites.json and trips.json to anyone who asked, unauthenticated.
// Keeping it above ROOT means that whole class of bug cannot recur even
// if the static-file logic is rewritten later. Override with AUTH_DIR
// if the host needs it somewhere specific.
const AUTH_DIR = process.env.AUTH_DIR
  ? path.resolve(process.env.AUTH_DIR)
  : path.resolve(ROOT, "..", "compass-tos-auth");

// Where the credential store used to live, for the one-time migration
// below. Nothing else may read from here.
const LEGACY_AUTH_DIR = path.join(ROOT, "data", "auth");

const USERS_FILE = path.join(AUTH_DIR, "users.json");
const SESSIONS_FILE = path.join(AUTH_DIR, "sessions.json");
const INVITES_FILE = path.join(AUTH_DIR, "invites.json");
const OWNERSHIP_FILE = path.join(AUTH_DIR, "trips.json");

// Moves an existing data/auth/ store up out of the served root on first
// boot after this fix. Without this, the server would come up with no
// users at all - which not only locks everyone out, it flips the app into
// "needsBootstrap" mode, letting the first stranger to load the page
// register and claim every trip. So this migration is itself a security
// control, not just a convenience.
function migrateLegacyAuthDir() {
  if (fs.existsSync(AUTH_DIR) || !fs.existsSync(LEGACY_AUTH_DIR)) {
    return;
  }

  try {
    fs.mkdirSync(AUTH_DIR, { recursive: true });

    // Everything in the legacy directory was publicly readable, so the
    // live session tokens and unused invite tokens in it must be treated
    // as compromised. They are NOT carried across: sessions.json and
    // invites.json are recreated empty, which signs everyone out (they
    // simply log in again) and voids any leaked invite token. users.json
    // and trips.json are migrated intact - losing those would lock the
    // owner out and orphan every trip's ownership record.
    const SANITISE = { "sessions.json": { sessions: [] }, "invites.json": { invites: [] } };

    fs.readdirSync(LEGACY_AUTH_DIR).forEach((name) => {
      const from = path.join(LEGACY_AUTH_DIR, name);

      const to = path.join(AUTH_DIR, name);

      if (!fs.statSync(from).isFile()) {
        return;
      }

      if (Object.prototype.hasOwnProperty.call(SANITISE, name)) {
        fs.writeFileSync(to, JSON.stringify(SANITISE[name], null, 2), "utf8");

        console.log(`[auth migration] ${name} was publicly exposed - recreated EMPTY, not migrated`);
      } else {
        fs.copyFileSync(from, to);
      }

      fs.unlinkSync(from);
    });

    // Remove the now-empty legacy directory so nothing is left behind
    // inside the served root. Non-fatal if it can't be removed (e.g. a
    // stray file remains) - the static server refuses that path anyway.
    try {
      fs.rmdirSync(LEGACY_AUTH_DIR);
    } catch (error) {
      console.warn("[auth migration] legacy dir not empty, left in place:", error.code);
    }

    console.log(`[auth migration] moved credential store out of the served root -> ${AUTH_DIR}`);
  } catch (error) {
    console.error("[auth migration] FAILED - credential store may still be inside the served root:", error.message);
  }
}

migrateLegacyAuthDir();

// If the migration could not complete, the credential store is still
// sitting inside the served root AND the app would boot with no users -
// which flips it into "needsBootstrap", letting the first stranger to
// load the page register and claim every trip. Refusing to start is the
// safe failure here: a server that's down is recoverable, a server that's
// been taken over is not.
if (fs.existsSync(path.join(LEGACY_AUTH_DIR, "users.json"))) {
  console.error("=".repeat(64));
  console.error("REFUSING TO START: the credential store is still inside the");
  console.error("served root and could not be moved to:");
  console.error(`  ${AUTH_DIR}`);
  console.error("Fix the permissions on that path (or set the AUTH_DIR env var");
  console.error("to a writable location OUTSIDE the app directory), then start");
  console.error("again. Starting anyway would expose password hashes and let a");
  console.error("stranger claim every trip.");
  console.error("=".repeat(64));

  process.exit(1);
}

const SESSION_COOKIE = "compass_session";

const SESSION_EXPIRY_MS = parseInt(process.env.SESSION_EXPIRY || "", 10) || 7 * 24 * 60 * 60 * 1000;

const REGISTRATION_MODE = process.env.REGISTRATION_MODE || "invite"; // "invite" | "open"

function readAuthFile(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    return fallback;
  }
}

function writeAuthFile(file, data) {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function readUsers() {
  return readAuthFile(USERS_FILE, { users: [] }).users || [];
}

function writeUsers(users) {
  writeAuthFile(USERS_FILE, { users });
}

function readSessions() {
  return readAuthFile(SESSIONS_FILE, { sessions: [] }).sessions || [];
}

function writeSessions(sessions) {
  writeAuthFile(SESSIONS_FILE, { sessions });
}

function readInvites() {
  return readAuthFile(INVITES_FILE, { invites: [] }).invites || [];
}

function writeInvites(invites) {
  writeAuthFile(INVITES_FILE, { invites });
}

function readOwnership() {
  return readAuthFile(OWNERSHIP_FILE, { trips: {} }).trips || {};
}

function writeOwnership(trips) {
  writeAuthFile(OWNERSHIP_FILE, { trips });
}

function newAuthId(prefix) {
  return prefix + "-" + crypto.randomBytes(12).toString("hex");
}

// =========================================================
// Geoapify proxy
//
// The API key NEVER reaches the browser or the repo - it lives only in
// the GEOAPIFY_KEY env var on the server. This repo is public, and a key
// embedded in client JS would be committed straight into it. Everything
// geo-related goes through here so there's exactly one place holding the
// secret, one place to cache, and one place to throttle.
//
// Requires a signed-in user: credits are a finite shared resource, so an
// anonymous caller must not be able to spend them.
// =========================================================

const GEOAPIFY_KEY = process.env.GEOAPIFY_KEY || "";

const GEOAPIFY_HOST = "api.geoapify.com";

// Whitelisted upstream calls. An open-ended proxy would let a signed-in
// user hit any Geoapify endpoint (including the expensive ones like Route
// Planner, which costs locations²) on our key, so each supported call is
// named explicitly along with how to read its very different response.
//
//   jsonFormat: geocoding endpoints take format=json; routing returns
//               GeoJSON and must NOT have format forced onto it.
//   shape:      each endpoint's response is trimmed to what the UI needs.
const GEOAPIFY_ROUTES = {
  autocomplete: { path: "/v1/geocode/autocomplete", jsonFormat: true, shape: shapeGeocodeResponse },
  geocode: { path: "/v1/geocode/search", jsonFormat: true, shape: shapeGeocodeResponse },
  reverse: { path: "/v1/geocode/reverse", jsonFormat: true, shape: shapeGeocodeResponse },
  routing: { path: "/v1/routing", jsonFormat: false, shape: shapeRoutingResponse },
};

// Params we're willing to forward. Anything else is dropped, so a caller
// can't smuggle in something that changes the cost profile.
const GEOAPIFY_ALLOWED_PARAMS = new Set([
  "text", "limit", "lang", "filter", "bias", "type", "lat", "lon",
  "waypoints", "mode", "units", "avoid",
  // details=route_details returns per-segment road attributes, which is
  // the only way to know how much of a route is tolled. The response
  // grows to ~170KB; shapeRoutingResponse distils it to two numbers, so
  // the browser never sees the bulk.
  "details",
]);

function shapeGeocodeResponse(parsed) {
  // Trim to just what the client needs. Sending the full payload back
  // would be wasteful and leaks more of the provider's shape than the
  // UI should depend on.
  const results = (parsed.results || []).map((r) => ({
    formatted: r.formatted || r.address_line1 || r.name || "",
    name: r.name || r.city || r.formatted || "",
    lat: r.lat,
    lon: r.lon,
    country: r.country || "",
    countryCode: (r.country_code || "").toUpperCase(),
    state: r.state || "",
    city: r.city || "",
    resultType: r.result_type || "",
    confidence: r.rank && typeof r.rank.confidence === "number" ? r.rank.confidence : null,
  }));

  return { results };
}

// Per-segment road detail, wherever the provider chose to nest it.
//
// A bounded walk rather than a hard-coded path on purpose: the segments
// were confirmed to exist (a Rome-Naples route reports 360 of them, 225
// tolled) but their exact nesting under legs/steps/details is the
// provider's business and not something worth breaking on. Only two
// fields are needed, and an object carrying BOTH a numeric distance and a
// boolean toll is unambiguously one of them - nothing else in the
// response has that pair.
//
// country_code is inherited downwards, because it may sit on the segment
// or on the leg containing it. Absent entirely just means no country
// split, which the app already copes with.
//
// NO flatMap, fromEntries or optional chaining anywhere here: this file
// runs on Node 10.24.1 in production.
function collectRouteSegments(node, depth, country, into) {
  if (!node || typeof node !== "object" || depth > 8) {
    return;
  }

  if (Array.isArray(node)) {
    for (var i = 0; i < node.length; i++) {
      collectRouteSegments(node[i], depth + 1, country, into);
    }

    return;
  }

  var here = typeof node.country_code === "string" && node.country_code
    ? node.country_code.toUpperCase()
    : country;

  if (typeof node.distance === "number" && typeof node.toll === "boolean") {
    into.push({ distance: node.distance, toll: node.toll, country: here });

    // A segment has no segments inside it, so there is nothing below to
    // find and descending would only double-count.
    return;
  }

  var keys = Object.keys(node);

  for (var k = 0; k < keys.length; k++) {
    collectRouteSegments(node[keys[k]], depth + 1, here, into);
  }
}

function shapeRoutingResponse(parsed) {
  const feature = (parsed.features || [])[0];

  if (!feature) {
    return { route: null };
  }

  const props = feature.properties || {};

  const geometry = feature.geometry || {};

  // GeoJSON is [lon, lat]; Leaflet wants [lat, lng]. Flip here so the
  // client never has to remember which way round the provider is.
  // MultiLineString nests one level deeper than LineString.
  const lines = geometry.type === "MultiLineString"
    ? geometry.coordinates || []
    : [geometry.coordinates || []];

  // NOTE: deliberately not Array.prototype.flatMap - the production host
  // runs Node 10.24.1, where flatMap doesn't exist (it landed in Node 11).
  // Using it here threw at runtime and surfaced as a generic 502.
  const path = [];

  lines.forEach((line) => {
    (line || []).forEach((pair) => {
      path.push([pair[1], pair[0]]);
    });
  });

  // Only present when details=route_details was asked for. An ordinary
  // map redraw does not pay for it and gets nulls here, which every
  // caller already treats as "not known".
  var segments = [];

  collectRouteSegments(props, 0, "", segments);

  var tolledMetres = 0;

  var byCountry = null;

  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i];

    if (seg.toll) {
      tolledMetres += seg.distance;
    }

    if (seg.country) {
      if (!byCountry) {
        byCountry = {};
      }

      if (!byCountry[seg.country]) {
        byCountry[seg.country] = { km: 0, tolledKm: 0 };
      }

      byCountry[seg.country].km += seg.distance / 1000;

      if (seg.toll) {
        byCountry[seg.country].tolledKm += seg.distance / 1000;
      }
    }
  }

  if (byCountry) {
    var codes = Object.keys(byCountry);

    for (var c = 0; c < codes.length; c++) {
      byCountry[codes[c]].km = Math.round(byCountry[codes[c]].km * 10) / 10;

      byCountry[codes[c]].tolledKm = Math.round(byCountry[codes[c]].tolledKm * 10) / 10;
    }
  }

  return {
    route: {
      // distance is metres and time is seconds per Geoapify's docs; convert
      // once here so no caller has to know the raw units.
      distanceKm: typeof props.distance === "number" ? Math.round((props.distance / 1000) * 10) / 10 : null,
      durationMinutes: typeof props.time === "number" ? Math.round(props.time / 60) : null,
      // null, not 0, when no detail was requested. Zero would read as
      // "this route is toll-free", which is a different claim.
      tolledKm: segments.length ? Math.round((tolledMetres / 1000) * 10) / 10 : null,
      byCountry: byCountry,
      path,
    },
  };
}

// Identical lookups are common (retyping, re-opening a form), and every
// one costs a credit. Short TTL keeps results fresh enough for addresses.
const geoCache = new Map();

const GEO_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const GEO_CACHE_MAX_ENTRIES = 500;

function geoCacheGet(key) {
  const hit = geoCache.get(key);

  if (!hit) {
    return null;
  }

  if (Date.now() - hit.ts > GEO_CACHE_TTL_MS) {
    geoCache.delete(key);

    return null;
  }

  return hit.body;
}

function geoCacheSet(key, body) {
  // Simple bound: drop the oldest insertion once full. Map preserves
  // insertion order, so the first key is the oldest.
  if (geoCache.size >= GEO_CACHE_MAX_ENTRIES) {
    geoCache.delete(geoCache.keys().next().value);
  }

  geoCache.set(key, { body, ts: Date.now() });
}

// The same request, kept as BYTES.
//
// fetchUpstream concatenates chunks onto a string, which decodes them as
// UTF-8 and silently mangles anything that is not text. That is fine for
// the JSON endpoints and would quietly corrupt every PNG.
function fetchUpstreamBinary(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 12000 }, (upstream) => {
      const chunks = [];

      let size = 0;

      upstream.on("data", (chunk) => {
        size += chunk.length;

        // A basemap for one day is tens of kilobytes. Anything past this
        // is not an image we asked for, and it would end up base64'd into
        // a document either way.
        if (size > 4 * 1024 * 1024) {
          req.destroy();

          reject(new Error("Upstream image too large."));

          return;
        }

        chunks.push(chunk);
      });

      upstream.on("end", () =>
        resolve({
          status: upstream.statusCode,
          buffer: Buffer.concat(chunks),
          contentType: upstream.headers["content-type"] || "",
        }));
    });

    req.on("error", reject);

    req.on("timeout", () => {
      req.destroy();

      reject(new Error("Upstream timed out."));
    });
  });
}

// A BASEMAP FOR ONE DAY, AS A DATA URI.
//
// WHY NOT tile.openstreetmap.org DIRECTLY, which the live map uses.
//
// The OSM Foundation's tile policy allows light interactive use and
// forbids bulk downloading and redistribution. Fetching a hundred tiles
// per export and BAKING THEM PERMANENTLY into a document that gets
// shared and printed is both. The live map browsing tiles as you pan is
// exactly what those servers are for; this is not, and doing it would be
// taking something donated for something else.
//
// Geoapify serves the same OpenStreetMap data under a licence this app
// already holds a key for, which is why the key exists. It costs a
// credit per map, cached here for a day like everything else.
//
// Returned as base64 rather than as an image response: the caller needs
// a data URI to embed anyway, and it keeps this endpoint's contract the
// same JSON shape as every other one.
async function handleStaticMap(req, res) {
  if (!GEOAPIFY_KEY) {
    return sendJSON(res, 503, {
      error: "Maps are not configured on this server.",
      code: "GEOAPIFY_NOT_CONFIGURED",
    });
  }

  const params = new URL(req.url, "http://localhost").searchParams;

  const num = (name, min, max) => {
    const value = Number(params.get(name));

    return isFinite(value) && value >= min && value <= max ? value : null;
  };

  const lat = num("lat", -85, 85);

  const lon = num("lon", -180, 180);

  // Bounded rather than trusted: width and height are what this costs,
  // in bytes and in credits, and they arrive from a browser.
  const width = num("width", 64, 1400);

  const height = num("height", 64, 1400);

  const zoom = num("zoom", 1, 18);

  if (lat === null || lon === null || width === null || height === null || zoom === null) {
    return sendJSON(res, 400, { error: "A centre, zoom and size are required." });
  }

  const cacheKey = "staticmap:" + [lat, lon, zoom, width, height].join(",");

  const cached = geoCacheGet(cacheKey);

  if (cached) {
    return sendJSON(res, 200, cached);
  }

  // osm-carto is the plain OpenStreetMap look, which is what was asked
  // for and what a reader recognises.
  const url =
    "https://maps.geoapify.com/v1/staticmap?style=osm-carto" +
    "&width=" + Math.round(width) +
    "&height=" + Math.round(height) +
    "&center=lonlat:" + lon + "," + lat +
    "&zoom=" + zoom +
    "&scaleFactor=2" +
    "&apiKey=" + encodeURIComponent(GEOAPIFY_KEY);

  try {
    const upstream = await fetchUpstreamBinary(url);

    if (upstream.status !== 200 || upstream.contentType.indexOf("image") === -1) {
      console.error("[geoapify] staticmap returned " + upstream.status + " " + upstream.contentType);

      return sendJSON(res, 502, { error: "Map image unavailable.", code: "GEO_UPSTREAM_STATUS" });
    }

    const payload = {
      image: "data:" + upstream.contentType.split(";")[0] + ";base64," + upstream.buffer.toString("base64"),
      attribution: "\u00a9 OpenStreetMap contributors, \u00a9 Geoapify",
    };

    geoCacheSet(cacheKey, payload);

    return sendJSON(res, 200, payload);
  } catch (error) {
    console.error("[geoapify] staticmap failed:", error.message);

    return sendJSON(res, 502, { error: "Map image unavailable.", code: "GEO_UPSTREAM_FAILED" });
  }
}

function fetchUpstream(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 8000 }, (upstream) => {
      let data = "";

      upstream.on("data", (chunk) => { data += chunk; });

      upstream.on("end", () => resolve({ status: upstream.statusCode, body: data }));
    });

    req.on("error", reject);

    req.on("timeout", () => {
      req.destroy();

      reject(new Error("Upstream timed out."));
    });
  });
}

async function handleGeoRoute(req, res, action) {
  const route = GEOAPIFY_ROUTES[action];

  if (!route) {
    return sendJSON(res, 404, { error: "Unknown geo route." });
  }

  if (!GEOAPIFY_KEY) {
    // Explicit and honest rather than a confusing upstream error - the
    // client shows this so it's obvious the server just isn't configured.
    return sendJSON(res, 503, {
      error: "Location lookup isn't configured on this server.",
      code: "GEOAPIFY_NOT_CONFIGURED",
    });
  }

  const incoming = new URL(req.url, "http://localhost");

  const params = new URLSearchParams();

  incoming.searchParams.forEach((value, name) => {
    if (GEOAPIFY_ALLOWED_PARAMS.has(name) && String(value).trim()) {
      params.set(name, value);
    }
  });

  if (action === "routing") {
    if (!params.get("waypoints")) {
      return sendJSON(res, 400, { error: "Waypoints are required." });
    }

    if (!params.get("mode")) {
      params.set("mode", "drive");
    }
  } else if (!params.get("text") && action !== "reverse") {
    return sendJSON(res, 400, { error: "A search term is required." });
  }

  if (route.jsonFormat) {
    params.set("format", "json");

    if (!params.get("limit")) {
      params.set("limit", "5");
    }
  }

  const cacheKey = action + "?" + params.toString();

  const cached = geoCacheGet(cacheKey);

  if (cached) {
    return sendJSON(res, 200, { ...cached, cached: true });
  }

  params.set("apiKey", GEOAPIFY_KEY);

  try {
    const upstream = await fetchUpstream(`https://${GEOAPIFY_HOST}${route.path}?${params.toString()}`);

    if (upstream.status !== 200) {
      console.error(`[geoapify] ${action} responded ${upstream.status}`);

      // A 4xx is an answer ABOUT THE REQUEST: these two points cannot be
      // routed between. That is not a failure and must not be retried -
      // it will say the same thing every time. For routing it means
      // exactly what an empty feature list means, so it is reported the
      // same way: no route.
      //
      // Geoapify is not consistent about which of the two it uses for an
      // unroutable pair, so both spellings are handled rather than
      // guessed at.
      if (upstream.status >= 400 && upstream.status < 500 && upstream.status !== 429) {
        if (action === "routing") {
          return sendJSON(res, 200, { route: null });
        }

        return sendJSON(res, 200, { results: [] });
      }

      // A 429 or a 5xx is the service having a moment. Carries a CODE and
      // the status so the client can say "try again" instead of blaming a
      // pin that was correct all along.
      return sendJSON(res, 502, {
        error: "Location service unavailable.",
        code: "GEO_UPSTREAM_STATUS",
        upstreamStatus: upstream.status,
      });
    }

    let parsed;

    try {
      parsed = JSON.parse(upstream.body);
    } catch (error) {
      console.error(`[geoapify] ${action} returned unparseable JSON:`, upstream.body.slice(0, 200));

      return sendJSON(res, 502, { error: "Location service returned something unexpected.", code: "GEO_BAD_RESPONSE" });
    }

    // Shaping is OUR code, so a failure here is a bug, not a network
    // problem - report it distinctly. Conflating the two is what made a
    // flatMap-on-Node-10 crash look like "couldn't reach the service".
    let payload;

    try {
      payload = route.shape(parsed);
    } catch (error) {
      console.error(`[geoapify] ${action} response shaping FAILED (this is a server bug, not the upstream):`, error.stack || error.message);

      return sendJSON(res, 500, { error: "Couldn't read the location service's response.", code: "GEO_SHAPE_FAILED" });
    }

    geoCacheSet(cacheKey, payload);

    return sendJSON(res, 200, payload);
  } catch (error) {
    console.error(`[geoapify] ${action} request failed:`, error.stack || error.message);

    return sendJSON(res, 502, { error: "Couldn't reach the location service.", code: "GEO_UPSTREAM_UNREACHABLE" });
  }
}

// --- Auth rate limiting (in-memory, zero deps) ---
//
// Throttles brute-force password guessing and mass account creation.
// In-memory is deliberate: this app runs as a single Node process, so a
// Map is sufficient and adds no dependency. It resets on restart, which
// is an accepted trade-off at this scale.

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

const RATE_LIMIT_MAX_ATTEMPTS = 8;

const authAttempts = new Map();

function clientKey(req) {
  // Behind the LiteSpeed proxy the socket address is the proxy's, so the
  // real client IP is the first entry in x-forwarded-for.
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();

  return forwarded || req.socket.remoteAddress || "unknown";
}

function isRateLimited(key) {
  const now = Date.now();

  const attempts = (authAttempts.get(key) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  authAttempts.set(key, attempts);

  return attempts.length >= RATE_LIMIT_MAX_ATTEMPTS;
}

function recordAttempt(key) {
  const attempts = authAttempts.get(key) || [];

  attempts.push(Date.now());

  authAttempts.set(key, attempts);
}

// Stop the Map growing without bound on a long-running process.
// .unref() so this timer never keeps the process alive by itself.
setInterval(() => {
  const now = Date.now();

  for (const [key, attempts] of authAttempts) {
    const fresh = attempts.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

    if (fresh.length === 0) {
      authAttempts.delete(key);
    } else {
      authAttempts.set(key, fresh);
    }
  }
}, 10 * 60 * 1000).unref();

// --- Passwords (scrypt) ---
//
// ASYNC on purpose. scryptSync blocks Node's single event-loop thread for
// the whole derivation, and /auth/login + /auth/register are public and
// unauthenticated - so a handful of concurrent requests could freeze the
// entire app for every other user. The callback form runs on the libuv
// threadpool instead, so other requests keep being served.

const PASSWORD_MIN_LENGTH = 10;

// Upper bound so nobody can push a megabyte-long string through scrypt
// purely to burn CPU. Well above any realistic passphrase.
const PASSWORD_MAX_LENGTH = 200;

// Single source of truth for the policy, so registration and password
// changes can never drift apart. Returns an error string, or null if OK.
function passwordPolicyError(password) {
  const value = String(password || "");

  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }

  if (value.length > PASSWORD_MAX_LENGTH) {
    return `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`;
  }

  return null;
}

function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password), salt, 64, (error, derivedKey) => {
      if (error) {
        return reject(error);
      }

      resolve(derivedKey);
    });
  });
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");

  const hash = (await scryptAsync(password, salt)).toString("hex");

  return { salt, hash };
}

async function verifyPassword(password, salt, hash) {
  if (!salt || !hash) {
    return false;
  }

  const test = (await scryptAsync(password, salt)).toString("hex");

  const a = Buffer.from(test, "hex");

  const b = Buffer.from(hash, "hex");

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// --- Users ---

function findUserByUsername(username) {
  const lower = String(username || "").trim().toLowerCase();

  return readUsers().find((u) => u.usernameLower === lower) || null;
}

function findUserById(id) {
  return readUsers().find((u) => u.id === id) || null;
}

function publicUser(u) {
  return u ? { id: u.id, username: u.username, email: u.email || "" } : null;
}

// --- Cookies & sessions ---

function parseCookies(req) {
  const header = req.headers["cookie"] || "";

  const out = {};

  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");

    if (idx > -1) {
      out[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
    }
  });

  return out;
}

function cookiePath() {
  return (BASE_PATH || "") + "/";
}

// Only mark the cookie Secure when the request genuinely arrived over HTTPS
// (behind the LiteSpeed proxy that means checking x-forwarded-proto). Marking
// it Secure on a plain-HTTP request would stop the browser sending it back and
// lock everyone out; SameSite=Strict + HttpOnly still protect it either way.
function isSecureRequest(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();

  if (proto) {
    return proto === "https";
  }

  return !!(req.socket && req.socket.encrypted);
}

function sessionSetCookie(req, token) {
  const maxAge = Math.floor(SESSION_EXPIRY_MS / 1000);

  const secure = isSecureRequest(req) ? "; Secure" : "";

  return `${SESSION_COOKIE}=${token}; Path=${cookiePath()}; HttpOnly; SameSite=Strict${secure}; Max-Age=${maxAge}`;
}

function sessionClearCookie(req) {
  const secure = isSecureRequest(req) ? "; Secure" : "";

  return `${SESSION_COOKIE}=; Path=${cookiePath()}; HttpOnly; SameSite=Strict${secure}; Max-Age=0`;
}

function createSession(userId) {
  const sessions = readSessions().filter((s) => new Date(s.expiresAt).getTime() > Date.now());

  const id = crypto.randomBytes(32).toString("hex");

  sessions.push({
    id,
    userId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS).toISOString(),
  });

  writeSessions(sessions);

  return id;
}

function getSessionUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE];

  if (!token) {
    return null;
  }

  const session = readSessions().find((s) => s.id === token);

  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
    return null;
  }

  return findUserById(session.userId);
}

function destroySession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];

  if (!token) {
    return;
  }

  writeSessions(readSessions().filter((s) => s.id !== token));
}

// Drops EVERY session belonging to a user. Used when a password changes:
// rotating a credential has to log out anywhere else it was already
// signed in, or the rotation doesn't actually revoke anything.
function destroySessionsForUser(userId) {
  writeSessions(readSessions().filter((s) => s.userId !== userId));
}

// --- Trip ownership & access ---

// The single source of truth for "what can this user do on this trip":
//   "owner" | "write" | "read" | "guest" | null (no access at all)
// "guest" is the trip-plan-only tier (Build 52 follow-up) - same read
// access as "read" except budget/expenses are blocked entirely and
// prices are stripped from the research collections (see
// GUEST_BLOCKED_COLLECTIONS / GUEST_PRICE_STRIPPED_COLLECTIONS below).
function getTripPermission(user, tripId) {
  if (!user) {
    return null;
  }

  const entry = readOwnership()[tripId];

  if (!entry) {
    return null;
  }

  if (entry.owner === user.id) {
    return "owner";
  }

  const collaborator = (entry.collaborators || []).find((c) => c.userId === user.id);

  return collaborator ? collaborator.permission : null;
}

function canAccessTrip(user, tripId) {
  return getTripPermission(user, tripId) !== null;
}

function canEditTrip(user, tripId) {
  const permission = getTripPermission(user, tripId);

  return permission === "owner" || permission === "write";
}

function isTripOwner(user, tripId) {
  return getTripPermission(user, tripId) === "owner";
}

// Guest tier: shares the trip plan, route and activities - never money.
// These two collections aren't shown to a guest at all; the rest are
// served with cost fields stripped out rather than the raw file.
const GUEST_BLOCKED_COLLECTIONS = new Set(["budget.json", "expenses.json"]);

const GUEST_PRICE_STRIPPED_COLLECTIONS = new Set([
  "accommodation.json",
  "activities.json",
  "restaurants.json",
  "transport.json",
  "flights.json",
]);

// Reads a trip data file, strips the cost-bearing fields for a guest
// viewer, and sends it - used instead of the normal static-file serve
// for the collections above when the requester's permission is "guest".
function serveGuestRedactedTripFile(req, res, tripId, filename) {
  const filePath = path.join(ROOT, "data", "projects", tripId, filename);

  let raw;

  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    res.writeHead(404, { "Content-Type": "text/plain" });

    return res.end("Not found: " + filename);
  }

  let data;

  try {
    data = JSON.parse(raw);
  } catch (error) {
    return sendJSON(res, 500, { error: "Could not read trip data." });
  }

  if (filename === "project.json") {
    if (data.project) {
      delete data.project.budgetCap;
    }
  } else if (Array.isArray(data.items)) {
    data.items = data.items.map((item) => {
      const redacted = { ...item, price: null };

      if (filename === "restaurants.json") {
        delete redacted.priceLevel;
      }

      return redacted;
    });
  }

  return sendJSON(res, 200, data);
}

function setTripOwner(tripId, userId, name) {
  const trips = readOwnership();

  trips[tripId] = trips[tripId] || { collaborators: [] };

  trips[tripId].owner = userId;

  trips[tripId].name = name || trips[tripId].name || tripId;

  trips[tripId].createdAt = trips[tripId].createdAt || new Date().toISOString();

  writeOwnership(trips);
}

function removeTripOwnership(tripId) {
  const trips = readOwnership();

  delete trips[tripId];

  writeOwnership(trips);
}

// First registered user claims every existing trip folder that has no
// ownership record yet - so the trips built before accounts existed keep
// working and belong to whoever sets the account up.
function claimUnownedTrips(userId) {
  const projectsDir = path.join(ROOT, "data", "projects");

  const trips = readOwnership();

  let changed = false;

  try {
    fs.readdirSync(projectsDir, { withFileTypes: true }).forEach((entry) => {
      if (entry.isDirectory() && !trips[entry.name]) {
        trips[entry.name] = { owner: userId, collaborators: [], createdAt: new Date().toISOString() };

        changed = true;
      }
    });
  } catch (error) {
    // No projects dir yet - nothing to claim.
  }

  if (changed) {
    writeOwnership(trips);
  }
}

// --- Collaborators (Build 47 Phase 2 - trip sharing) ---

function findUserByEmail(email) {
  const lower = String(email || "").trim().toLowerCase();

  if (!lower) {
    return null;
  }

  return readUsers().find((u) => String(u.email || "").toLowerCase() === lower) || null;
}

function addCollaborator(tripId, userId, permission) {
  const trips = readOwnership();

  const entry = trips[tripId];

  if (!entry) {
    return;
  }

  entry.collaborators = entry.collaborators || [];

  const existing = entry.collaborators.find((c) => c.userId === userId);

  if (existing) {
    existing.permission = permission;
  } else {
    entry.collaborators.push({ userId, permission, addedAt: new Date().toISOString() });
  }

  writeOwnership(trips);
}

function removeCollaborator(tripId, userId) {
  const trips = readOwnership();

  const entry = trips[tripId];

  if (!entry) {
    return;
  }

  entry.collaborators = (entry.collaborators || []).filter((c) => c.userId !== userId);

  writeOwnership(trips);
}

// When someone registers, pick up any trips that were shared to their email
// before they had an account, and add them as a collaborator automatically.
function claimPendingShares(user) {
  const trips = readOwnership();

  let changed = false;

  Object.keys(trips).forEach((tripId) => {
    const entry = trips[tripId];

    const pending = (entry.pendingShares || []).filter((p) => p.email === user.email);

    if (pending.length === 0) {
      return;
    }

    entry.collaborators = entry.collaborators || [];

    pending.forEach((p) => {
      if (!entry.collaborators.find((c) => c.userId === user.id)) {
        entry.collaborators.push({ userId: user.id, permission: p.permission, addedAt: new Date().toISOString() });
      }
    });

    entry.pendingShares = (entry.pendingShares || []).filter((p) => p.email !== user.email);

    changed = true;
  });

  if (changed) {
    writeOwnership(trips);
  }
}

// --- Auth route handling (all public - these ARE the login gate) ---

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function handleAuthRoute(req, res) {
  const url = req.url.split("?")[0];

  if (url === "/auth/me" && req.method === "GET") {
    const user = getSessionUser(req);

    return sendJSON(res, 200, {
      user: publicUser(user),
      registrationMode: REGISTRATION_MODE,
      needsBootstrap: readUsers().length === 0,
    });
  }

  if (url === "/auth/logout" && req.method === "POST") {
    destroySession(req);

    res.setHeader("Set-Cookie", sessionClearCookie(req));

    return sendJSON(res, 200, { ok: true });
  }

  if (url === "/auth/login" && req.method === "POST") {
    const loginKey = "login:" + clientKey(req);

    if (isRateLimited(loginKey)) {
      return sendJSON(res, 429, {
        error: "Too many sign-in attempts. Wait a few minutes and try again.",
      });
    }

    let body;

    try {
      body = JSON.parse(await readBody(req));
    } catch (error) {
      return sendJSON(res, error.code === "BODY_TOO_LARGE" ? 413 : 400, { error: "Bad request." });
    }

    const user = findUserByUsername(body.username);

    if (!user || !(await verifyPassword(body.password, user.salt, user.hash))) {
      recordAttempt(loginKey);

      return sendJSON(res, 401, { error: "Username or password incorrect." });
    }

    const users = readUsers();

    const stored = users.find((u) => u.id === user.id);

    if (stored) {
      stored.lastLogin = new Date().toISOString();

      writeUsers(users);
    }

    res.setHeader("Set-Cookie", sessionSetCookie(req, createSession(user.id)));

    return sendJSON(res, 200, { ok: true, user: publicUser(user) });
  }

  if (url === "/auth/register" && req.method === "POST") {
    const registerKey = "register:" + clientKey(req);

    if (isRateLimited(registerKey)) {
      return sendJSON(res, 429, {
        error: "Too many sign-up attempts. Wait a few minutes and try again.",
      });
    }

    // Every attempt counts here, successful or not - this throttles mass
    // account creation as well as invite-token guessing.
    recordAttempt(registerKey);

    let body;

    try {
      body = JSON.parse(await readBody(req));
    } catch (error) {
      return sendJSON(res, error.code === "BODY_TOO_LARGE" ? 413 : 400, { error: "Bad request." });
    }

    return handleRegister(req, res, body);
  }

  // Change your own password. Requires the CURRENT password even though
  // there's already a session, so a borrowed/stolen session can't be used
  // to lock the real owner out of their account.
  if (url === "/auth/password" && req.method === "POST") {
    const user = getSessionUser(req);

    if (!user) {
      return sendJSON(res, 401, { error: "Not signed in." });
    }

    // Rate limited on the same budget as login - this route verifies a
    // password, so it's another place someone could guess against.
    const passwordKey = "password:" + clientKey(req);

    if (isRateLimited(passwordKey)) {
      return sendJSON(res, 429, {
        error: "Too many attempts. Wait a few minutes and try again.",
      });
    }

    let body;

    try {
      body = JSON.parse(await readBody(req));
    } catch (error) {
      return sendJSON(res, error.code === "BODY_TOO_LARGE" ? 413 : 400, { error: "Bad request." });
    }

    const currentPassword = String(body.currentPassword || "");

    const newPassword = String(body.newPassword || "");

    const confirmPassword = String(body.confirmPassword || "");

    const users = readUsers();

    const stored = users.find((u) => u.id === user.id);

    if (!stored) {
      return sendJSON(res, 401, { error: "Not signed in." });
    }

    if (!(await verifyPassword(currentPassword, stored.salt, stored.hash))) {
      recordAttempt(passwordKey);

      return sendJSON(res, 403, { error: "Your current password isn't right." });
    }

    const policyError = passwordPolicyError(newPassword);

    if (policyError) {
      return sendJSON(res, 400, { error: policyError });
    }

    if (newPassword !== confirmPassword) {
      return sendJSON(res, 400, { error: "New passwords don't match." });
    }

    if (newPassword === currentPassword) {
      return sendJSON(res, 400, { error: "That's the same as your current password." });
    }

    const { salt, hash } = await hashPassword(newPassword);

    stored.salt = salt;

    stored.hash = hash;

    stored.passwordChangedAt = new Date().toISOString();

    writeUsers(users);

    // Changing a password must invalidate every OTHER session for this
    // user - that's the whole point of rotating a compromised credential.
    // The current session is re-issued so the person doing it isn't
    // logged out of the tab they're standing in.
    destroySessionsForUser(user.id);

    res.setHeader("Set-Cookie", sessionSetCookie(req, createSession(user.id)));

    return sendJSON(res, 200, { ok: true });
  }

  if (url === "/auth/invite" && req.method === "POST") {
    const user = getSessionUser(req);

    if (!user) {
      return sendJSON(res, 401, { error: "Not signed in." });
    }

    let body = {};

    try {
      body = JSON.parse(await readBody(req));
    } catch (error) {
      // Empty body is fine - a generic invite with no email attached.
    }

    const email = String(body.email || "").trim();

    if (email && !EMAIL_RE.test(email)) {
      return sendJSON(res, 400, { error: "That doesn't look like a valid email." });
    }

    const invites = readInvites();

    const token = crypto.randomBytes(18).toString("hex");

    invites.push({
      token,
      createdBy: user.id,
      email: email.toLowerCase(),
      note: String(body.note || "").slice(0, 120),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      used: false,
      usedAt: null,
    });

    writeInvites(invites);

    const emailed = await sendInviteEmail(req, email, token, { inviter: user.username });

    return sendJSON(res, 200, { ok: true, token, emailed });
  }

  if (url === "/auth/invites" && req.method === "GET") {
    const user = getSessionUser(req);

    if (!user) {
      return sendJSON(res, 401, { error: "Not signed in." });
    }

    const now = Date.now();

    const invites = readInvites()
      .filter((i) => i.createdBy === user.id)
      .map((i) => ({
        token: i.token,
        email: i.email || "",
        note: i.note || "",
        used: i.used,
        expired: new Date(i.expiresAt).getTime() < now,
      }));

    return sendJSON(res, 200, { invites });
  }

  return sendJSON(res, 404, { error: "Unknown auth route." });
}

async function handleRegister(req, res, body) {
  const username = String(body.username || "").trim();

  const password = String(body.password || "");

  const confirm = String(body.confirmPassword || "");

  const email = String(body.email || "").trim();

  const inviteToken = String(body.inviteToken || body.invite || "").trim();

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return sendJSON(res, 400, { error: "Username must be 3-20 letters, numbers or underscores." });
  }

  if (!EMAIL_RE.test(email)) {
    return sendJSON(res, 400, { error: "Please enter a valid email address." });
  }

  const policyError = passwordPolicyError(password);

  if (policyError) {
    return sendJSON(res, 400, { error: policyError });
  }

  if (password !== confirm) {
    return sendJSON(res, 400, { error: "Passwords don't match." });
  }

  if (findUserByUsername(username)) {
    return sendJSON(res, 409, { error: "That username is already taken." });
  }

  const users = readUsers();

  const isFirstUser = users.length === 0;

  let invite = null;

  // Registration is invite-gated, except: the very first account (bootstrap),
  // or when REGISTRATION_MODE is "open".
  if (!isFirstUser && REGISTRATION_MODE !== "open") {
    invite = readInvites().find(
      (i) => i.token === inviteToken && !i.used && new Date(i.expiresAt).getTime() > Date.now(),
    );

    if (!invite) {
      return sendJSON(res, 403, { error: "This invite is invalid or has expired. Ask for a new one." });
    }

    // If the invite was addressed to a specific email, it must match.
    if (invite.email && invite.email !== email.toLowerCase()) {
      return sendJSON(res, 403, { error: "This invite was sent to a different email address." });
    }
  }

  const { salt, hash } = await hashPassword(password);

  const user = {
    id: newAuthId("usr"),
    username,
    usernameLower: username.toLowerCase(),
    email: email.toLowerCase(),
    salt,
    hash,
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
  };

  users.push(user);

  writeUsers(users);

  if (invite) {
    const invites = readInvites();

    const stored = invites.find((i) => i.token === invite.token);

    if (stored) {
      stored.used = true;

      stored.usedAt = new Date().toISOString();

      writeInvites(invites);
    }
  }

  if (isFirstUser) {
    claimUnownedTrips(user.id);
  }

  claimPendingShares(user);

  res.setHeader("Set-Cookie", sessionSetCookie(req, createSession(user.id)));

  return sendJSON(res, 200, { ok: true, user: publicUser(user) });
}

async function handleShareAdd(req, res, tripId, owner) {
  let body;

  try {
    body = JSON.parse(await readBody(req));
  } catch (error) {
    return sendJSON(res, 400, { error: "Bad request." });
  }

  const identifier = String(body.identifier || "").trim();

  const rawPermission = String(body.permission || "").trim();

  const permission = ["write", "guest"].includes(rawPermission) ? rawPermission : "read";

  if (!identifier) {
    return sendJSON(res, 400, { error: "Enter a username or email." });
  }

  const isEmail = EMAIL_RE.test(identifier);

  const user = isEmail ? findUserByEmail(identifier) : findUserByUsername(identifier);

  if (user) {
    if (user.id === owner.id) {
      return sendJSON(res, 400, { error: "You already own this trip." });
    }

    addCollaborator(tripId, user.id, permission);

    return sendJSON(res, 200, { ok: true, added: user.username, permission });
  }

  // Not a registered user. If they gave an email, create a pending share plus
  // an invite, so when they register they're added to this trip automatically.
  if (isEmail) {
    const token = crypto.randomBytes(18).toString("hex");

    const trips = readOwnership();

    const entry = trips[tripId];

    entry.pendingShares = (entry.pendingShares || []).filter((p) => p.email !== identifier.toLowerCase());

    entry.pendingShares.push({ email: identifier.toLowerCase(), permission, token, invitedAt: new Date().toISOString() });

    writeOwnership(trips);

    const invites = readInvites();

    invites.push({
      token,
      createdBy: owner.id,
      email: identifier.toLowerCase(),
      note: "Shared trip: " + (entry.name || tripId),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      used: false,
      usedAt: null,
    });

    writeInvites(invites);

    const emailed = await sendInviteEmail(req, identifier.toLowerCase(), token, { inviter: owner.username, tripName: entry.name });

    return sendJSON(res, 200, { ok: true, pending: true, token, emailed });
  }

  return sendJSON(res, 404, { error: "No user with that username. To invite someone new, share using their email address." });
}

function handleShareList(req, res, tripId, isOwner) {
  const entry = readOwnership()[tripId] || {};

  const users = readUsers();

  // Named, so "who has access" can show the person who owns the thing
  // rather than starting the list at the first person they invited.
  const ownerUser = users.find((x) => x.id === entry.owner);

  const collaborators = (entry.collaborators || []).map((c) => {
    const u = users.find((x) => x.id === c.userId);

    return { userId: c.userId, username: u ? u.username : "(unknown)", permission: c.permission };
  });

  // OWNER ONLY. A pending share is the email address of somebody not yet
  // on the trip - a third party's personal data - and being on a trip
  // does not entitle you to it.
  const pending = isOwner
    ? (entry.pendingShares || []).map((p) => ({ email: p.email, permission: p.permission }))
    : [];

  return sendJSON(res, 200, {
    collaborators: collaborators,
    pending: pending,
    owner: entry.owner ? { userId: entry.owner, username: ownerUser ? ownerUser.username : "(unknown)" } : null,
  });
}

function handleShareRemove(req, res, tripId, target) {
  removeCollaborator(tripId, target);

  return sendJSON(res, 200, { ok: true });
}

// --- Email (best-effort, zero-dependency via the server's sendmail) ---
//
// cPanel/LiteSpeed hosting provides a local mail transfer agent, so we can
// hand a message to /usr/sbin/sendmail with no npm packages. This is
// best-effort: if it isn't available or fails, the caller still returns the
// invite link so it can be shared manually. Configure with env vars:
//   MAIL_ENABLED=false      - turn email sending off entirely
//   MAIL_FROM="Name <a@b>"  - the From address (use one on your own domain)
//   SENDMAIL_PATH=/path      - if sendmail lives somewhere else

const MAIL_ENABLED = process.env.MAIL_ENABLED !== "false";

const SENDMAIL_PATH = process.env.SENDMAIL_PATH || "/usr/sbin/sendmail";

const MAIL_FROM = process.env.MAIL_FROM || "COMPASS-TOS <noreply@deploytelco.com.au>";

function publicOrigin(req) {
  const proto = String(req.headers["x-forwarded-proto"] || (isSecureRequest(req) ? "https" : "http"))
    .split(",")[0]
    .trim();

  const host = req.headers["host"] || "localhost";

  return `${proto}://${host}`;
}

function inviteLink(req, token) {
  return `${publicOrigin(req)}${BASE_PATH || ""}/?invite=${token}`;
}

function buildInviteEmail(toEmail, link, opts) {
  const options = opts || {};

  const inviter = options.inviter || "Someone";

  const forTrip = options.tripName ? ` to help plan the trip "${options.tripName}"` : "";

  const subject = options.tripName
    ? `${inviter} shared a trip with you on COMPASS-TOS`
    : `${inviter} invited you to COMPASS-TOS`;

  const bodyLines = [
    "Hi,",
    "",
    `${inviter} has invited you${forTrip} on COMPASS-TOS, a private travel planner.`,
    "",
    "Create your account here (this link expires in 7 days):",
    link,
    "",
    "If you weren't expecting this, you can safely ignore this email.",
    "",
    "- COMPASS-TOS",
  ];

  const message =
    `From: ${MAIL_FROM}\r\n` +
    `To: ${toEmail}\r\n` +
    `Subject: ${subject}\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: text/plain; charset=UTF-8\r\n` +
    `\r\n` +
    bodyLines.join("\r\n") +
    `\r\n`;

  return { subject, message };
}

// Returns a Promise<boolean> that only resolves true once sendmail has
// actually exited with status 0 (accepted the message for delivery) -
// previously this returned true the instant the child process was
// spawned, before we knew whether sendmail even existed on the box, so
// the "emailed" flag shown to the user was more hope than fact.
function sendInviteEmail(req, toEmail, token, opts) {
  if (!MAIL_ENABLED || !toEmail) {
    return Promise.resolve(false);
  }

  const link = inviteLink(req, token);

  const { message } = buildInviteEmail(toEmail, link, opts || {});

  return new Promise((resolve) => {
    let settled = false;

    const finish = (ok, reason) => {
      if (settled) {
        return;
      }

      settled = true;

      if (ok) {
        console.log(`[mail] sendmail accepted the invite email for ${toEmail}`);
      } else {
        console.warn(`[mail] invite email to ${toEmail} did not send: ${reason}`);
      }

      resolve(ok);
    };

    let child;

    try {
      child = require("child_process").spawn(SENDMAIL_PATH, ["-t", "-oi"], {
        stdio: ["pipe", "ignore", "ignore"],
      });
    } catch (error) {
      return finish(false, error.message);
    }

    const timeout = setTimeout(() => finish(false, "timed out waiting for sendmail"), 5000);

    child.on("error", (error) => {
      clearTimeout(timeout);

      finish(false, error.message);
    });

    child.on("exit", (code) => {
      clearTimeout(timeout);

      finish(code === 0, `sendmail exited with code ${code}`);
    });

    child.stdin.on("error", () => {
      // EPIPE if sendmail isn't actually there - the process "error"/"exit"
      // handlers above are what settle this promise, not this one.
    });

    child.stdin.write(message);

    child.stdin.end();
  });
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function daysBetweenInclusive(startDate, endDate) {
  const start = new Date(startDate + "T00:00:00Z");

  const end = new Date(endDate + "T00:00:00Z");

  const diffMs = end.getTime() - start.getTime();

  return Math.round(diffMs / (24 * 60 * 60 * 1000)) + 1;
}

function addDaysToDate(dateString, days) {
  const date = new Date(dateString + "T00:00:00Z");

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

const EMPTY_PLANNING_ITEM_SCHEMA = { version: "2.0", schema: "planning-item", items: [] };

function buildProjectFiles(input) {
  const totalDays = daysBetweenInclusive(input.startDate, input.endDate);

  const journeyDays = [];

  for (let i = 0; i < totalDays; i++) {
    journeyDays.push({
      day: i + 1,
      date: addDaysToDate(input.startDate, i),
      title: `Day ${i + 1}`,
      location: "",
      overnight: "",
      locked: false,
      items: [],
    });
  }

  return {
    "project.json": {
      project: {
        id: input.id,
        name: input.name,
        subtitle: input.subtitle || "",
        status: "Planning",
        version: "1.0",
        created: new Date().toISOString().slice(0, 10),
        departureDate: input.startDate,
        returnDate: input.endDate,
        homeCountry: input.homeCountry || "",
        currency: input.currency || "USD",
        language: "English",
        // Who is actually on the trip. Names only at creation; dates and
        // birthdays are set later, once the journey has real days.
        //
        // This replaces `travellers`, which every trip was created with
        // since Build 29 and which NOTHING has ever read - three unnamed
        // placeholders sitting in every project.json. Existing trips keep
        // theirs until the Participants page offers to bring them across.
        participants: buildParticipants(input.participants),
      },
      settings: {
        planningMode: true,
        travelMode: false,
        journalMode: false,
        darkTheme: false,
        currency: input.currency || "USD",
        distanceUnits: "km",
        temperatureUnits: "C",
      },
      progress: {
        flights: "Idea",
        accommodation: "Idea",
        transport: "Idea",
        activities: "Idea",
        budget: "Idea",
      },
      statistics: {
        plannedNights: Math.max(totalDays - 1, 0),
        plannedDays: totalDays,
        bookedEvents: 0,
        lockedEvents: 0,
        completedEvents: 0,
      },
      projectState: {
        lastOpened: "",
        lastSaved: "",
        currentDay: 1,
        selectedEvent: null,
        selectedDestination: null,
      },
    },

    "journey.json": { version: "1.0", days: journeyDays },

    "accommodation.json": EMPTY_PLANNING_ITEM_SCHEMA,
    "activities.json": EMPTY_PLANNING_ITEM_SCHEMA,
    "transport.json": EMPTY_PLANNING_ITEM_SCHEMA,
    "restaurants.json": EMPTY_PLANNING_ITEM_SCHEMA,
    "flights.json": EMPTY_PLANNING_ITEM_SCHEMA,

    "events.json": { events: [] },

    "project-locations.json": { version: "1.0", locations: [] },

    "bookings.json": {
      flights: [],
      cars: [],
      rail: [],
      accommodation: [],
      activities: [],
      restaurants: [],
      notes: "",
    },

    "budget.json": {
      currency: input.currency || "USD",
      estimate_low: 0,
      estimate_high: 0,
      categories: {
        accommodation: { low: 0, high: 0 },
        transport: {
          car_hire: { low: 0, high: 0 },
          train: { low: 0, high: 0 },
          ferry: { low: 0, high: 0 },
          fuel_tolls_parking: { low: 0, high: 0 },
        },
        food: { low: 0, high: 0 },
        activities: { low: 0, high: 0 },
        contingency: { low: 0, high: 0 },
      },
      notes: [],
    },

    "expenses.json": { version: "1.0", schema: "expenses", items: [] },

    "journal.json": { version: "1.0", schema: "journal", entries: [] },

    "weather.json": {},
  };
}

async function handleCreateProject(req, res) {
  let body;

  try {
    body = JSON.parse(await readBody(req));
  } catch (error) {
    return sendJSON(res, 400, { error: "Request body must be valid JSON." });
  }

  const name = (body.name || "").trim();

  const startDate = body.startDate || "";

  const endDate = body.endDate || "";

  if (!name) {
    return sendJSON(res, 400, { error: "Trip name is required." });
  }

  if (!startDate || !endDate) {
    return sendJSON(res, 400, { error: "Start date and end date are required." });
  }

  if (new Date(endDate) < new Date(startDate)) {
    return sendJSON(res, 400, { error: "End date cannot be before start date." });
  }

  const id = slugify(name);

  if (!id) {
    return sendJSON(res, 400, { error: "Could not generate a valid id from that trip name." });
  }

  const projectDir = path.join(ROOT, "data", "projects", id);

  if (fs.existsSync(projectDir)) {
    return sendJSON(res, 409, { error: `A trip with id "${id}" already exists.` });
  }

  try {
    const files = buildProjectFiles({
      id,
      name,
      subtitle: body.subtitle,
      startDate,
      endDate,
      currency: body.currency,
      homeCountry: body.homeCountry,
    });

    fs.mkdirSync(projectDir, { recursive: true });

    Object.entries(files).forEach(([filename, content]) => {
      fs.writeFileSync(path.join(projectDir, filename), JSON.stringify(content, null, 2), "utf8");
    });

    setTripOwner(id, req.user ? req.user.id : null, name);

    console.log(`[created project] ${id}`);

    return sendJSON(res, 200, { ok: true, id });
  } catch (error) {
    console.error("[create project failed]", error.message);

    return sendJSON(res, 500, { error: "Could not create the trip." });
  }
}


// =========================================================
// COPY A TRIP
//
// For "we have planned this to death, now let us try it a week later /
// through Switzerland instead". The copy starts identical and you edit
// what differs, which is far less work than rebuilding a fortnight of
// research.
//
// WHAT DOES NOT COME WITH IT, and why:
//
//   expenses.json  Money actually spent on the real trip. An alternative
//                  that has not happened has not cost anything, and
//                  carrying it would put fictional spending in Actual.
//
//   journal.json   Entries are about the trip that happened. Two copies
//                  of one evening is how you end up editing the wrong one.
//
//   uploads/       The journal's photos, which the journal no longer
//                  references. Copying them would double the disk for
//                  files nothing points at.
//
// STATUSES ARE KEPT. A copy of a trip with a booked flight starts with a
// booked flight, because the alternative may well use the same flight -
// and resetting everything to Research would throw away the very research
// the copy exists to reuse. The Budget therefore shows real numbers from
// the first second, which is the point.
//
// The copier OWNS the copy, and the original's collaborators do NOT come
// with it. Sharing is a decision per trip; inheriting it would hand people
// access to a plan they have never seen.
// =========================================================

// Everything else in the folder is planning, and planning is what a copy
// is for. Named rather than inferred, so a new collection added later is
// copied by default - the safe direction, since a missing file makes a
// section look empty while an extra one is merely tidy-up.
const COPY_EXCLUDES = ["expenses.json", "journal.json", "uploads"];

function copyTreeSync(from, to) {
  fs.mkdirSync(to, { recursive: true });

  // No fs.cpSync: production runs Node 10.24.1, where it does not exist.
  fs.readdirSync(from, { withFileTypes: true }).forEach((entry) => {
    const source = path.join(from, entry.name);

    const target = path.join(to, entry.name);

    if (entry.isDirectory()) {
      copyTreeSync(source, target);

      return;
    }

    fs.copyFileSync(source, target);
  });
}

// Rename a trip. The DISPLAY NAME only - the id and its folder stay.
//
// The name lives in two places and both move together, or the trip list
// and the trip itself disagree about what it is called: project.json's
// project.name, and the ownership record the list is built from.
async function handleRenameProject(req, res, id) {
  if (!safeName(id)) {
    return sendJSON(res, 400, { error: "Invalid project id." });
  }

  var dir = path.join(ROOT, "data", "projects", id);

  if (!fs.existsSync(dir)) {
    return sendJSON(res, 404, { error: "Trip not found." });
  }

  var body;

  try {
    body = JSON.parse(await readBody(req));
  } catch (error) {
    return sendJSON(res, 400, { error: "Request body must be valid JSON." });
  }

  var name = String((body && body.name) || "").trim().slice(0, 120);

  if (!name) {
    return sendJSON(res, 400, { error: "A trip needs a name." });
  }

  try {
    var projectPath = path.join(dir, "project.json");

    if (fs.existsSync(projectPath)) {
      var data = JSON.parse(fs.readFileSync(projectPath, "utf8"));

      data.project = data.project || {};

      data.project.name = name;

      fs.writeFileSync(projectPath, JSON.stringify(data, null, 2), "utf8");
    }

    // The ownership record, so the trip LIST agrees. Read-modify-write
    // rather than setTripOwner, which would rewrite the owner too - and
    // a rename must never change who owns the thing.
    var trips = readOwnership();

    if (trips[id]) {
      trips[id].name = name;

      writeOwnership(trips);
    }

    console.log("[renamed project] " + id + " -> " + name);

    return sendJSON(res, 200, { ok: true, id: id, name: name });
  } catch (error) {
    console.error("[rename project failed]", error.stack || error.message);

    return sendJSON(res, 500, { error: "Could not rename the trip." });
  }
}

async function handleCopyProject(req, res, sourceId) {
  if (!safeName(sourceId)) {
    return sendJSON(res, 400, { error: "Invalid project id." });
  }

  const sourceDir = path.join(ROOT, "data", "projects", sourceId);

  if (!fs.existsSync(sourceDir)) {
    return sendJSON(res, 404, { error: "Trip not found." });
  }

  let body;

  try {
    body = JSON.parse(await readBody(req));
  } catch (error) {
    return sendJSON(res, 400, { error: "Request body must be valid JSON." });
  }

  const name = String((body && body.name) || "").trim();

  if (!name) {
    return sendJSON(res, 400, { error: "The copy needs a name." });
  }

  const id = slugify(name);

  if (!id) {
    return sendJSON(res, 400, { error: "Could not generate a valid id from that name." });
  }

  const targetDir = path.join(ROOT, "data", "projects", id);

  // Both checked against the real root, so a crafted name cannot write
  // outside data/projects even if slugify one day lets something through.
  if (!targetDir.startsWith(path.join(ROOT, "data", "projects"))) {
    return sendJSON(res, 400, { error: "Invalid path." });
  }

  if (fs.existsSync(targetDir)) {
    return sendJSON(res, 409, { error: `A trip called "${name}" already exists. Give the copy a different name.` });
  }

  try {
    fs.mkdirSync(targetDir, { recursive: true });

    let copied = 0;

    fs.readdirSync(sourceDir, { withFileTypes: true }).forEach((entry) => {
      if (COPY_EXCLUDES.indexOf(entry.name) !== -1) {
        return;
      }

      const from = path.join(sourceDir, entry.name);

      const to = path.join(targetDir, entry.name);

      if (entry.isDirectory()) {
        copyTreeSync(from, to);
      } else {
        fs.copyFileSync(from, to);
      }

      copied += 1;
    });

    // The copy is its own trip: new id, new name, and never inheriting the
    // original's archived flag - you have just made it, so it is current.
    const projectPath = path.join(targetDir, "project.json");

    if (fs.existsSync(projectPath)) {
      const data = JSON.parse(fs.readFileSync(projectPath, "utf8"));

      data.project = data.project || {};

      data.project.id = id;

      data.project.name = name;

      data.project.archived = false;

      data.project.copiedFrom = sourceId;

      fs.writeFileSync(projectPath, JSON.stringify(data, null, 2), "utf8");
    }

    // A fresh ownership entry, so collaborators do NOT come with it.
    setTripOwner(id, req.user ? req.user.id : null, name);

    console.log(`[copied project] ${sourceId} -> ${id} (${copied} entries)`);

    return sendJSON(res, 200, { ok: true, id: id });
  } catch (error) {
    console.error("[copy project failed]", error.stack || error.message);

    // A half-made trip is worse than none: it shows in the list and opens
    // to a broken screen. Best effort, and the error is reported either way.
    //
    // Via collectPaths rather than a recursive rmdir/rmSync: production is
    // Node 10.24.1, where fs.rmSync does not exist at all and rmdir has no
    // recursive option. The delete handler learnt this the hard way and
    // this reuses its answer.
    try {
      const leftovers = collectPaths(targetDir);

      leftovers.files.forEach((filePath) => {
        try {
          fs.unlinkSync(filePath);
        } catch (ignored) {
          /* best effort */
        }
      });

      leftovers.dirs
        .slice()
        .reverse()
        .forEach((dirPath) => {
          try {
            fs.rmdirSync(dirPath);
          } catch (ignored) {
            /* best effort */
          }
        });
    } catch (cleanupError) {
      console.error("[copy cleanup failed]", cleanupError.message);
    }

    return sendJSON(res, 500, { error: "Could not copy the trip." });
  }
}

async function handleArchiveProject(req, res, id) {
  if (!safeName(id)) {
    return sendJSON(res, 400, { error: "Invalid project id." });
  }

  const projectPath = path.join(ROOT, "data", "projects", id, "project.json");

  if (!fs.existsSync(projectPath)) {
    return sendJSON(res, 404, { error: "Trip not found." });
  }

  let body;

  try {
    body = JSON.parse(await readBody(req));
  } catch (error) {
    return sendJSON(res, 400, { error: "Request body must be valid JSON." });
  }

  try {
    // Synchronous read-modify-write, no await in between - same atomicity
    // guarantee used for Journal's append operations.
    const data = JSON.parse(fs.readFileSync(projectPath, "utf8"));

    if (!data.project) {
      data.project = {};
    }

    data.project.archived = !!body.archived;

    fs.writeFileSync(projectPath, JSON.stringify(data, null, 2), "utf8");

    console.log(`[${data.project.archived ? "archived" : "unarchived"} project] ${id}`);

    return sendJSON(res, 200, { ok: true, archived: data.project.archived });
  } catch (error) {
    console.error("[archive toggle failed]", error.message);

    return sendJSON(res, 500, { error: "Could not update the trip." });
  }
}

// Walks a directory and returns every file and every directory under it
// (dirs including the root itself), depth-first. Used by the delete-project
// fallback below to remove entries one at a time instead of all-or-nothing.
function collectPaths(dir) {
  const files = [];

  const dirs = [dir];

  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const nested = collectPaths(full);

      files.push(...nested.files);

      dirs.push(...nested.dirs);
    } else {
      files.push(full);
    }
  });

  return { files, dirs };
}

function handleDeleteProject(req, res, id) {
  if (!safeName(id)) {
    return sendJSON(res, 400, { error: "Invalid project id." });
  }

  const projectDir = path.join(ROOT, "data", "projects", id);

  if (!projectDir.startsWith(path.join(ROOT, "data", "projects"))) {
    return sendJSON(res, 400, { error: "Invalid path." });
  }

  if (!fs.existsSync(projectDir)) {
    return sendJSON(res, 404, { error: "Trip not found." });
  }

  // The common case: a single recursive removal succeeds outright.
  try {
    fs.rmSync(projectDir, { recursive: true, force: true });

    removeTripOwnership(id);

    console.log(`[deleted project] ${id}`);

    return sendJSON(res, 200, { ok: true });
  } catch (error) {
    console.error("[delete project failed, retrying file-by-file]", error.code, error.message);
  }

  // Fallback: fs.rmSync throws (and removes nothing) if ANY single file in
  // the tree has a permission/lock problem - seen on some shared hosts.
  // Remove everything we can file-by-file instead of leaving the whole
  // trip stuck, and report exactly what's left so a repeat failure is
  // diagnosable instead of a bare, silent 500.
  let files;

  let dirs;

  try {
    ({ files, dirs } = collectPaths(projectDir));
  } catch (error) {
    console.error("[delete project failed - could not list its files]", error.code, error.message);

    return sendJSON(res, 500, { error: "Could not delete the trip.", detail: error.message, code: error.code });
  }

  const failed = [];

  files.forEach((filePath) => {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      failed.push({ path: path.relative(projectDir, filePath), code: error.code, message: error.message });
    }
  });

  // Deepest directories first, so a parent is only removed once everything
  // inside it is already gone.
  dirs
    .sort((a, b) => b.length - a.length)
    .forEach((dirPath) => {
      try {
        fs.rmdirSync(dirPath);
      } catch (error) {
        // A directory that's already gone (removed as part of an earlier,
        // now-empty parent) isn't a real failure - only report one that
        // still exists and still has something in it.
        if (fs.existsSync(dirPath) && fs.readdirSync(dirPath).length > 0) {
          failed.push({ path: path.relative(projectDir, dirPath) || ".", code: error.code, message: error.message });
        }
      }
    });

  if (failed.length > 0) {
    console.error(`[delete project partially failed] ${id}`, JSON.stringify(failed));

    return sendJSON(res, 500, {
      error: "Could not fully delete the trip - some files could not be removed.",
      failed,
    });
  }

  removeTripOwnership(id);

  console.log(`[deleted project via file-by-file fallback] ${id}`);

  return sendJSON(res, 200, { ok: true });
}

function handleProjectsList(req, res) {
  const projectsDir = path.join(ROOT, "data", "projects");

  try {
    const ownership = readOwnership();

    const user = req.user;

    const visible = (id) => {
      const e = ownership[id];

      if (!e || !user) {
        return false;
      }

      if (e.owner === user.id) {
        return true;
      }

      return (e.collaborators || []).some((c) => c.userId === user.id);
    };

    const entries = fs
      .readdirSync(projectsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && visible(entry.name));

    // Read ONCE for the whole list rather than per trip - this runs on
    // every visit to the landing page.
    const listUsers = readUsers();

    const projects = entries.map((entry) => {
      const id = entry.name;

      const ownEntry = ownership[id];

      const role = ownEntry && ownEntry.owner === user.id ? "owner" : "collaborator";

      const collab = role === "collaborator" ? (ownEntry.collaborators || []).find((c) => c.userId === user.id) : null;

      // Who else is on it, for the trip card. Names only - enough to say
      // "shared with Kate and Jo" without a second request per trip.
      //
      // OWNER ONLY, to match the share route. Leaving it open would hand
      // a collaborator the full roster through a side channel while the
      // front door returns 403 - which is worse than either answer alone,
      // because it looks like the boundary holds.
      const sharedWith = role !== "owner" ? [] : (ownEntry.collaborators || [])
        .map((c) => {
          const u = listUsers.find((x) => x.id === c.userId);

          return u ? u.username : null;
        })
        .filter(Boolean);

      const ownerUser = listUsers.find((x) => x.id === ownEntry.owner);

      const summary = {
        id,
        name: id,
        sharedWith: sharedWith,
        ownerName: ownerUser ? ownerUser.username : "",
        subtitle: "",
        departureDate: "",
        returnDate: "",
        archived: false,
        role,
        permission: role === "owner" ? "write" : collab ? collab.permission : "read",
      };

      try {
        const projectData = JSON.parse(
          fs.readFileSync(path.join(projectsDir, id, "project.json"), "utf8"),
        );

        if (projectData.project) {
          summary.name = projectData.project.name || id;
          summary.subtitle = projectData.project.subtitle || "";
          summary.departureDate = projectData.project.departureDate || "";
          summary.returnDate = projectData.project.returnDate || "";
          summary.archived = !!projectData.project.archived;
        }
      } catch (error) {
        // No project.json, or it's malformed - fall back to the folder
        // name only, rather than failing the whole list.
      }

      return summary;
    });

    return sendJSON(res, 200, { projects });
  } catch (error) {
    console.error("[projects list failed]", error.message);

    return sendJSON(res, 500, { error: "Could not list projects." });
  }
}

const BASE_PATH = (process.env.BASE_PATH || "").replace(/\/$/, "");

const server = http.createServer(async (req, res) => {
  // A subfolder app MUST be served with a trailing slash. Without it the
  // browser treats the mount name as a file and resolves every relative
  // asset (app/*.js, CSS, manifest) AND window.API_BASE against the parent
  // folder - the domain root - so everything 404s and the service worker
  // registers at the wrong (root) scope. If the app is requested at exactly
  // its mount point with no trailing slash (e.g. "/TOS" or "/TOS?x=1"),
  // redirect to the slashed form ("/TOS/") before doing anything else.
  if (BASE_PATH && (req.url === BASE_PATH || req.url.startsWith(BASE_PATH + "?"))) {
    const query = req.url.slice(BASE_PATH.length);

    res.writeHead(302, { Location: BASE_PATH + "/" + query });

    return res.end();
  }

  if (
    BASE_PATH &&
    (req.url === BASE_PATH || req.url.startsWith(BASE_PATH + "/") || req.url.startsWith(BASE_PATH + "?"))
  ) {
    let stripped = req.url.slice(BASE_PATH.length) || "/";

    if (stripped[0] !== "/") {
      stripped = "/" + stripped;
    }

    req.url = stripped;
  }

  // Auth endpoints (login / register / logout / me / invite) are public -
  // they ARE the login gate, so they must work before there's a session.
  if (req.url.split("?")[0].startsWith("/auth/")) {
    return handleAuthRoute(req, res);
  }

  const sessionUser = getSessionUser(req);

  req.user = sessionUser;

  req.authUser = sessionUser ? sessionUser.username : null;

  // Trip data is loaded by the front end as static files under
  // /data/projects/<id>/... - gate those by session AND ownership so no one
  // can read another person's trip just by knowing its folder name. A
  // "guest" viewer gets the trip plan but never money: budget/expenses
  // are blocked outright, and the priced collections + project.json are
  // served redacted instead of falling through to the raw static file.
  const staticTripMatch = req.url.match(/^\/data\/projects\/([^/]+)\/([^/?]+)/);

  if (staticTripMatch) {
    if (!sessionUser) {
      return sendJSON(res, 401, { error: "Not signed in." });
    }

    const [, tripId, filename] = staticTripMatch;

    const permission = getTripPermission(sessionUser, tripId);

    if (!permission) {
      return sendJSON(res, 403, { error: "You don't have access to this trip." });
    }

    if (permission === "guest") {
      if (GUEST_BLOCKED_COLLECTIONS.has(filename)) {
        return sendJSON(res, 403, { error: "Guest access doesn't include budget or expenses." });
      }

      if (GUEST_PRICE_STRIPPED_COLLECTIONS.has(filename) || filename === "project.json") {
        return serveGuestRedactedTripFile(req, res, tripId, filename);
      }
    }
  }

  // Every /api/ route requires a signed-in user.
  if (req.url.startsWith("/api/") && !sessionUser) {
    return sendJSON(res, 401, { error: "Not signed in." });
  }

  // Project-scoped data mutations require write access to that trip.
  const writeScoped = req.url.match(/^\/api\/(?:data|items|upload|journal)\/([^/?]+)/);

  if (writeScoped && !canEditTrip(sessionUser, writeScoped[1])) {
    return sendJSON(res, 403, { error: "You don't have edit access to this trip." });
  }

  if (req.url.match(/^\/api\/whoami\/?(?:\?.*)?$/) && req.method === "GET") {
    return sendJSON(res, 200, { user: req.authUser });
  }

  // Geoapify proxy - reached only by a signed-in user (gated above), so
  // credits can't be spent anonymously.
  const geoMatch = req.url.match(/^\/api\/geo\/([a-z]+)/);

  if (geoMatch) {
    if (req.method !== "GET") {
      return sendJSON(res, 405, { error: "Only GET is supported on this route." });
    }

    // Its own handler: everything else here returns shaped JSON from a
    // JSON upstream, and this returns an image.
    if (geoMatch[1] === "staticmap") {
      return handleStaticMap(req, res);
    }

    return handleGeoRoute(req, res, geoMatch[1]);
  }

  // Trip sharing (owner only): list / add / remove collaborators.
  const shareMatch = req.url.match(/^\/api\/trips\/([^/]+)\/share(?:\/([^/?]+))?\/?(?:\?.*)?$/);

  if (shareMatch) {
    const [, tripId, target] = shareMatch;

    const owner = isTripOwner(sessionUser, tripId);


    // A collaborator may always remove THEMSELVES ("Leave Trip") without
    // being the owner; every other sharing action is owner-only.
    const isSelfLeaving = req.method === "DELETE" && target && sessionUser && target === sessionUser.id;

    // EVERY sharing action, including reading the list, is owner-only.
    //
    // v1.36.0 briefly opened the GET to anyone with trip access, on the
    // reasoning that they are already trusted with the whole trip. Two
    // guards said otherwise by name - test-sharing.js and
    // test-guest-and-fixes.js, the latter under "guest: cannot manage
    // sharing or delete" - and they were right: the feature that wanted
    // it ("who has access") is for the OWNER, so the loosening bought
    // nothing and cost a boundary somebody had deliberately drawn.
    if (!owner && !isSelfLeaving) {
      return sendJSON(res, 403, { error: "Only the trip owner can manage sharing." });
    }

    if (req.method === "GET" && !target) {
      return handleShareList(req, res, tripId, owner);
    }

    if (req.method === "POST" && !target) {
      return handleShareAdd(req, res, tripId, sessionUser);
    }

    if (req.method === "DELETE" && target) {
      return handleShareRemove(req, res, tripId, target);
    }

    return sendJSON(res, 405, { error: "Unsupported method for this route." });
  }

  if (req.url.match(/^\/api\/projects\/?(?:\?.*)?$/) && req.method === "GET") {
    return handleProjectsList(req, res);
  }

  if (req.url.match(/^\/api\/projects\/?(?:\?.*)?$/) && req.method === "POST") {
    return handleCreateProject(req, res);
  }

  const projectItemMatch = req.url.match(/^\/api\/projects\/([^/?]+)(?:\/(archive|copy|rename))?\/?(?:\?.*)?$/);

  if (projectItemMatch) {
    const [, id, action] = projectItemMatch;

    // Copying needs WRITE, not ownership: someone who can already edit
    // the trip could reproduce it by hand anyway. A GUEST cannot and must
    // not - they are shown the plan without the costs, and a copy would
    // hand them the costs. Checked BEFORE the owner-only gate below,
    // which would otherwise refuse a collaborator.
    if (action === "copy" && req.method === "POST") {
      if (!canEditTrip(sessionUser, id)) {
        return sendJSON(res, 403, { error: "You need edit access to copy this trip." });
      }

      return handleCopyProject(req, res, id);
    }

    // Renaming needs WRITE, not ownership: anyone who can edit the trip
    // can already change everything inside it, and what it is CALLED is
    // the least of that. Checked before the owner-only gate for the same
    // reason copy is - it would otherwise refuse a collaborator.
    if (action === "rename" && req.method === "POST") {
      if (!canEditTrip(sessionUser, id)) {
        return sendJSON(res, 403, { error: "You need edit access to rename this trip." });
      }

      return handleRenameProject(req, res, id);
    }

    // Archiving or deleting a whole trip is owner-only.
    if (!isTripOwner(sessionUser, id)) {
      return sendJSON(res, 403, { error: "Only the trip owner can do that." });
    }

    if (action === "archive" && req.method === "PATCH") {
      return handleArchiveProject(req, res, id);
    }

    if (!action && req.method === "DELETE") {
      return handleDeleteProject(req, res, id);
    }

    return sendJSON(res, 405, { error: "Unsupported method for this route." });
  }

  const apiMatch = req.url.match(/^\/api\/data\/([^/]+)\/([^/?]+)/);

  if (apiMatch && req.method === "PUT") {
    const [, projectId, collectionWithExt] = apiMatch;

    const collection = collectionWithExt.replace(/\.json$/, "");

    return handleDataWrite(req, res, projectId, collection);
  }

  if (apiMatch && req.method !== "PUT") {
    return sendJSON(res, 405, { error: "Only PUT is supported on this route." });
  }

  const selectMatch = req.url.match(/^\/api\/items\/([^/]+)\/accommodation\/([^/]+)\/select\/?$/);

  if (selectMatch && req.method === "POST") {
    const [, projectId, itemId] = selectMatch;

    return handleAccommodationSelect(req, res, projectId, itemId);
  }

  const itemCollectionMatch = req.url.match(/^\/api\/items\/([^/]+)\/([^/]+)\/?(?:\?.*)?$/);

  if (itemCollectionMatch && req.method === "POST") {
    const [, projectId, collection] = itemCollectionMatch;

    return handleItemAdd(req, res, projectId, collection);
  }

  const itemMatch = req.url.match(/^\/api\/items\/([^/]+)\/([^/]+)\/([^/?]+)\/?(?:\?.*)?$/);

  if (itemMatch && req.method === "PUT") {
    const [, projectId, collection, itemId] = itemMatch;

    return handleItemUpdate(req, res, projectId, collection, itemId);
  }

  if (itemMatch && req.method === "DELETE") {
    const [, projectId, collection, itemId] = itemMatch;

    return handleItemRemove(req, res, projectId, collection, itemId);
  }

  const uploadMatch = req.url.match(/^\/api\/upload\/([^/?]+)/);

  if (uploadMatch && req.method === "POST") {
    return handleUpload(req, res, uploadMatch[1]);
  }

  if (uploadMatch && req.method !== "POST") {
    return sendJSON(res, 405, { error: "Only POST is supported on this route." });
  }

  const journalPhotoMatch = req.url.match(/^\/api\/journal\/([^/]+)\/(\d+)\/photo(?:\/([^/?]+))?$/);

  if (journalPhotoMatch) {
    const [, projectId, dayStr, photoId] = journalPhotoMatch;

    const day = parseInt(dayStr, 10);

    if (req.method === "POST" && !photoId) {
      return handleJournalPhotoAdd(req, res, projectId, day);
    }

    if (req.method === "DELETE" && photoId) {
      return handleJournalPhotoRemove(req, res, projectId, day, photoId);
    }

    return sendJSON(res, 405, { error: "Unsupported method for this route." });
  }

  const journalChecklistMatch = req.url.match(/^\/api\/journal\/([^/]+)\/(\d+)\/checklist(?:\/([^/?]+))?$/);

  if (journalChecklistMatch) {
    const [, projectId, dayStr, itemId] = journalChecklistMatch;

    const day = parseInt(dayStr, 10);

    if (req.method === "POST" && !itemId) {
      return handleJournalChecklistAdd(req, res, projectId, day);
    }

    if (req.method === "PATCH" && itemId) {
      return handleJournalChecklistToggle(req, res, projectId, day, itemId);
    }

    if (req.method === "DELETE" && itemId) {
      return handleJournalChecklistRemove(req, res, projectId, day, itemId);
    }

    return sendJSON(res, 405, { error: "Unsupported method for this route." });
  }

  if (req.method !== "GET") {
    res.writeHead(405);

    return res.end("Method not allowed");
  }

  serveStaticFile(req, res);
});

server.listen(PORT, () => {
  console.log(`COMPASS-TOS server running at http://localhost:${PORT}`);
  console.log(`Serving from: ${ROOT}`);
});
