/*
=========================================================

COMPASS-TOS

Geo (location lookup)

Version 1.0.0

Address autocomplete + geocoding, via the server's own
/api/geo/* proxy. The Geoapify key lives only on the
server (GEOAPIFY_KEY env var) - nothing here ever sees it.

Every lookup costs a credit, so this module is deliberately
frugal:
  - typing is DEBOUNCED (no request per keystroke)
  - a minimum query length before anything is sent
  - identical queries are answered from a local cache
  - an in-flight request is superseded, not queued, when
    the user keeps typing

If the server has no key configured the proxy returns a
503 with GEOAPIFY_NOT_CONFIGURED, and callers fall back to
the manual latitude/longitude fields rather than breaking.

=========================================================
*/

const Geo = {
  MIN_QUERY_LENGTH: 3,

  DEBOUNCE_MS: 350,

  _cache: new Map(),

  _timer: null,

  _seq: 0,

  configured: true,

  cacheKey(action, params) {
    return action + "|" + JSON.stringify(params);
  },

  async lookup(action, params) {
    const key = this.cacheKey(action, params);

    if (this._cache.has(key)) {
      return this._cache.get(key);
    }

    const query = new URLSearchParams(params).toString();

    const response = await fetch(`${window.API_BASE}/api/geo/${action}?${query}`);

    const data = await response.json();

    if (!response.ok) {
      if (data.code === "GEOAPIFY_NOT_CONFIGURED") {
        this.configured = false;
      }

      throw Object.assign(new Error(data.error || "Lookup failed."), { code: data.code });
    }

    const results = data.results || [];

    this._cache.set(key, results);

    return results;
  },

  search(text, options = {}) {
    return this.lookup("autocomplete", {
      text,
      limit: String(options.limit || 5),
      ...(options.type ? { type: options.type } : {}),
      ...(options.countryCode ? { filter: `countrycode:${String(options.countryCode).toLowerCase()}` } : {}),
    });
  },

  // Narrowed search with an automatic widening fallback.
  //
  // A day's location is a place you sleep, so `type=city` is the right
  // filter - Geoapify documents it as "cities, towns and villages", and it
  // strips out the council/boundary results that otherwise clutter the
  // list ("Council of the City of Sydney" and friends).
  //
  // The risk is a settlement it classifies as something else being lost
  // entirely, so if the narrowed search finds nothing we retry unfiltered
  // rather than dead-ending. That costs one extra credit only in the rare
  // empty case, and the caller is told which mode produced the results so
  // it can say so in the UI.
  async searchSettlements(text, options = {}) {
    const narrowed = await this.search(text, { ...options, type: "city" });

    if (narrowed.length > 0) {
      return { results: narrowed, widened: false };
    }

    const widened = await this.search(text, options);

    return { results: widened, widened: true };
  },

  // Debounced type-ahead. onResults/onError are called with the outcome;
  // a stale response (user kept typing) is dropped rather than rendered.
  onType(text, onResults, onError, options = {}) {
    clearTimeout(this._timer);

    const trimmed = String(text || "").trim();

    if (trimmed.length < this.MIN_QUERY_LENGTH) {
      onResults([], trimmed);

      return;
    }

    const mySeq = ++this._seq;

    this._timer = setTimeout(async () => {
      try {
        // settlements:true asks for towns/cities/villages only, widening
        // automatically if that finds nothing.
        const outcome = options.settlements
          ? await this.searchSettlements(trimmed, options)
          : { results: await this.search(trimmed, options), widened: false };

        if (mySeq !== this._seq) {
          return;
        }

        onResults(outcome.results, trimmed, { widened: outcome.widened });
      } catch (error) {
        if (mySeq !== this._seq) {
          return;
        }

        console.error("Location lookup failed:", error);

        if (onError) {
          onError(error);
        }
      }
    }, this.DEBOUNCE_MS);
  },

  cancel() {
    clearTimeout(this._timer);

    this._seq += 1;
  },

  // Driving route between two or more [lat, lng] points. Returns
  // { distanceKm, durationMinutes, path } where path is [lat,lng] pairs
  // ready to hand straight to Leaflet, or null if no route exists.
  //
  // Routing costs 1 credit per waypoint pair (+1 per 500km beyond the
  // first 500), so callers should route whole legs rather than polling.
  // Results are cached here and again on the server for 24h, so revisiting
  // the map doesn't re-spend.
  async route(points, options = {}) {
    if (!Array.isArray(points) || points.length < 2) {
      return null;
    }

    const waypoints = points.map((p) => `${p[0]},${p[1]}`).join("|");

    const params = { waypoints, mode: options.mode || "drive" };

    const key = this.cacheKey("routing", params);

    if (this._cache.has(key)) {
      return this._cache.get(key);
    }

    const response = await fetch(`${window.API_BASE}/api/geo/routing?${new URLSearchParams(params).toString()}`);

    const data = await response.json();

    if (!response.ok) {
      if (data.code === "GEOAPIFY_NOT_CONFIGURED") {
        this.configured = false;
      }

      throw Object.assign(new Error(data.error || "Routing failed."), { code: data.code });
    }

    this._cache.set(key, data.route);

    return data.route;
  },

  // Turns a proxy error code into something a person can act on. The
  // distinction matters: "not configured" is a settings problem, a server
  // bug is not something retrying will fix, and only a genuine network
  // failure is worth trying again.
  errorMessage(error, fallback) {
    const codes = {
      GEOAPIFY_NOT_CONFIGURED: "Location lookup isn't set up on this server.",
      GEO_SHAPE_FAILED: "The location service replied, but the app couldn't read it. This is a bug - please report it.",
      GEO_BAD_RESPONSE: "The location service returned something unexpected.",
      GEO_UPSTREAM_UNREACHABLE: "Couldn't reach the location service. Try again in a moment.",
    };

    return codes[error && error.code] || fallback || "Something went wrong.";
  },

  formatDuration(minutes) {
    if (typeof minutes !== "number") {
      return "";
    }

    const h = Math.floor(minutes / 60);

    const m = minutes % 60;

    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  },

  // A short label for a result - the full formatted address is often too
  // long for a day's location field, which wants "Katoomba" not
  // "Katoomba, Blue Mountains City Council, NSW 2780, Australia".
  shortLabel(result) {
    return result.city || result.name || result.formatted || "";
  },

  // The app stores day locations as lowercase slugs (day.location /
  // day.overnight are matched case-insensitively elsewhere), so keep the
  // same shape when a result is chosen.
  toSlug(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  },

  esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
};
