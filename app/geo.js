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
      ...(options.countryCode ? { filter: `countrycode:${String(options.countryCode).toLowerCase()}` } : {}),
    });
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
        const results = await this.search(trimmed, options);

        if (mySeq !== this._seq) {
          return;
        }

        onResults(results, trimmed);
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
