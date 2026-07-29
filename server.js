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

    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });

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

function handleProjectsList(req, res) {
  const projectsDir = path.join(ROOT, "data", "projects");

  try {
    const entries = fs
      .readdirSync(projectsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory());

    const projects = entries.map((entry) => {
      const id = entry.name;

      const summary = { id, name: id, subtitle: "", departureDate: "", returnDate: "" };

      try {
        const projectData = JSON.parse(
          fs.readFileSync(path.join(projectsDir, id, "project.json"), "utf8"),
        );

        if (projectData.project) {
          summary.name = projectData.project.name || id;
          summary.subtitle = projectData.project.subtitle || "";
          summary.departureDate = projectData.project.departureDate || "";
          summary.returnDate = projectData.project.returnDate || "";
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

const server = http.createServer(async (req, res) => {
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

  const apiMatch = req.url.match(/^\/api\/data\/([^/]+)\/([^/?]+)/);

  if (apiMatch && req.method === "PUT") {
    const [, projectId, collectionWithExt] = apiMatch;

    const collection = collectionWithExt.replace(/\.json$/, "");

    return handleDataWrite(req, res, projectId, collection);
  }

  if (apiMatch && req.method !== "PUT") {
    return sendJSON(res, 405, { error: "Only PUT is supported on this route." });
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
