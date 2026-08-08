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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];

    req.on("data", (chunk) => chunks.push(chunk));

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
      caption: body.caption || "",
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

function serveStaticFile(req, res) {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);

  if (urlPath === "/") {
    urlPath = "/index.html";
  }

  const filePath = path.normalize(path.join(ROOT, urlPath));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);

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

const AUTH_DIR = path.join(ROOT, "data", "auth");

const USERS_FILE = path.join(AUTH_DIR, "users.json");
const SESSIONS_FILE = path.join(AUTH_DIR, "sessions.json");
const INVITES_FILE = path.join(AUTH_DIR, "invites.json");
const OWNERSHIP_FILE = path.join(AUTH_DIR, "trips.json");

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

// --- Passwords (scrypt) ---

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");

  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");

  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  if (!salt || !hash) {
    return false;
  }

  const test = crypto.scryptSync(String(password), salt, 64).toString("hex");

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

// --- Trip ownership & access ---

function canAccessTrip(user, tripId) {
  if (!user) {
    return false;
  }

  const entry = readOwnership()[tripId];

  if (!entry) {
    return false;
  }

  if (entry.owner === user.id) {
    return true;
  }

  return (entry.collaborators || []).some((c) => c.userId === user.id);
}

function canEditTrip(user, tripId) {
  if (!user) {
    return false;
  }

  const entry = readOwnership()[tripId];

  if (!entry) {
    return false;
  }

  if (entry.owner === user.id) {
    return true;
  }

  return (entry.collaborators || []).some((c) => c.userId === user.id && c.permission === "write");
}

function isTripOwner(user, tripId) {
  if (!user) {
    return false;
  }

  const entry = readOwnership()[tripId];

  return !!entry && entry.owner === user.id;
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
    let body;

    try {
      body = JSON.parse(await readBody(req));
    } catch (error) {
      return sendJSON(res, 400, { error: "Bad request." });
    }

    const user = findUserByUsername(body.username);

    if (!user || !verifyPassword(body.password, user.salt, user.hash)) {
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
    let body;

    try {
      body = JSON.parse(await readBody(req));
    } catch (error) {
      return sendJSON(res, 400, { error: "Bad request." });
    }

    return handleRegister(req, res, body);
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

    return sendJSON(res, 200, { ok: true, token });
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

function handleRegister(req, res, body) {
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

  if (password.length < 6) {
    return sendJSON(res, 400, { error: "Password must be at least 6 characters." });
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

  const { salt, hash } = hashPassword(password);

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

  res.setHeader("Set-Cookie", sessionSetCookie(req, createSession(user.id)));

  return sendJSON(res, 200, { ok: true, user: publicUser(user) });
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
        travellers: [{ id: 1, name: "Traveller 1", role: "Primary" }],
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

  try {
    fs.rmSync(projectDir, { recursive: true, force: true });

    removeTripOwnership(id);

    console.log(`[deleted project] ${id}`);

    return sendJSON(res, 200, { ok: true });
  } catch (error) {
    console.error("[delete project failed]", error.message);

    return sendJSON(res, 500, { error: "Could not delete the trip." });
  }
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

    const projects = entries.map((entry) => {
      const id = entry.name;

      const summary = {
        id,
        name: id,
        subtitle: "",
        departureDate: "",
        returnDate: "",
        archived: false,
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
  // can read another person's trip just by knowing its folder name.
  const staticTripMatch = req.url.match(/^\/data\/projects\/([^/]+)\//);

  if (staticTripMatch) {
    if (!sessionUser) {
      return sendJSON(res, 401, { error: "Not signed in." });
    }

    if (!canAccessTrip(sessionUser, staticTripMatch[1])) {
      return sendJSON(res, 403, { error: "You don't have access to this trip." });
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

  if (req.url.match(/^\/api\/projects\/?(?:\?.*)?$/) && req.method === "GET") {
    return handleProjectsList(req, res);
  }

  if (req.url.match(/^\/api\/projects\/?(?:\?.*)?$/) && req.method === "POST") {
    return handleCreateProject(req, res);
  }

  const projectItemMatch = req.url.match(/^\/api\/projects\/([^/?]+)(?:\/(archive))?\/?(?:\?.*)?$/);

  if (projectItemMatch) {
    const [, id, action] = projectItemMatch;

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
