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
    const entries = fs
      .readdirSync(projectsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory());

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

  const authUser = getAuthenticatedUser(req);

  if (!authUser) {
    return requireAuth(res);
  }

  req.authUser = authUser;

  if (req.url.match(/^\/api\/whoami\/?(?:\?.*)?$/) && req.method === "GET") {
    return sendJSON(res, 200, { user: authUser });
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
