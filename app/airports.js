/*
=========================================================

COMPASS-TOS

Airports

Version 1.0.0

The airport reference list, and the searching that makes it
usable. Nothing here touches a flight record - Flights owns
that; this module only answers "which airport is that?".

WHY A BUNDLED LIST RATHER THAN A LOOKUP SERVICE

Because the question is asked on every keystroke of every
flight leg, and the answer never changes. 4,008 airports is
391 KB fetched once, cached by the service worker for the
life of the release, and free from then on - where a hosted
autocomplete would be a paid call per keystroke, a network
round trip on a phone, and nothing at all on a plane.

Source: ourairports.com, public domain. Filtered to those
with a real 3-letter IATA code AND scheduled service, which
is what "somewhere you can book a flight to" means. Small
airports are kept: 764 of them are Greek islands, Scottish
isles and remote strips that people genuinely fly to.

Plus a small SUPPLEMENT in tools/build-airports.js, for
airports you can genuinely book that ourairports has not yet
marked scheduled. WSI (Western Sydney) is the first: its row
is upstream, correct and complete, and still says
scheduled_service "no" while airlines sell seats on it - so a
rebuild alone would not have found it. Upstream wins on a
code collision, so each supplement entry deletes itself the
day the flag flips.

WHY PROXIMITY, NOT JUST TEXT

This is the whole reason the module exists. Milan has three
airports and text search finds two of them:

  MXP  "Milan Malpensa International Airport"   Ferno (VA)
  LIN  "Milano Linate Airport"                  Segrate (MI)
  BGY  "Il Caravaggio International Airport"    Orio al Serio (BG)

Typing "Milan" cannot find BGY. Its name commemorates a
painter, its town is Orio al Serio, and its keywords say
nothing about Milan - yet it is where a great many people
land when they fly to Milan. The municipality field is the
administrative town, not the city served: Malpensa is in
Ferno, Sydney's airport is in "Sydney (Mascot)", and Paris
Beauvais is 85 km from Paris.

So text finds what you can name, and near() finds what you
cannot. Between them nothing that matters is unreachable.

=========================================================
*/

const Airports = {
  URL: "assets/data/airports.json",

  // How far from a city still counts as that city's airport. Generous on
  // purpose: BGY is 45 km from Milan, and Beauvais is 85 km from Paris and
  // still sold as "Paris Beauvais". Beyond about 120 km the suggestions
  // stop being useful and start being noise.
  NEAR_KM: 120,

  _list: null,

  _byCode: null,

  _promise: null,

  // Loaded once per page. Every caller shares the one in-flight promise, so
  // four leg fields opening at once make one request, not four.
  load() {
    if (this._promise) {
      return this._promise;
    }

    this._promise = fetch(this.URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error("airport list unavailable (" + response.status + ")");
        }

        return response.json();
      })
      .then((payload) => {
        this.adopt(Array.isArray(payload.airports) ? payload.airports : []);

        return this._list;
      })
      .catch((error) => {
        // A failed load must not wedge the picker forever - the next open
        // tries again. The field still takes free text meanwhile.
        this._promise = null;

        throw error;
      });

    return this._promise;
  },

  // Indexing, separated from fetching so tests can load the real dataset
  // from disk and exercise the real ranking.
  adopt(list) {
    this._list = list;

    this._byCode = {};

    this._list.forEach((airport) => {
      this._byCode[airport.c] = airport;

      // Built once per airport rather than rebuilt on every keystroke.
      airport._s = this.normalise(airport.n + " " + airport.m);
    });

    return this._list;
  },

  ready() {
    return this._byCode !== null;
  },

  // "Zurich" has to match "Zürich", and "Bale" has to match "Bâle".
  normalise(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  },

  isCode(value) {
    return /^[A-Z]{3}$/.test(String(value || "").trim().toUpperCase());
  },

  lookup(code) {
    if (!this._byCode) {
      return null;
    }

    return this._byCode[String(code || "").trim().toUpperCase()] || null;
  },

  // "MXP - Milan Malpensa International Airport", or the raw value back
  // when it is not a code we know. A leg saved before this module existed
  // holds free text like "Sydney Airport", and that must still read
  // properly everywhere it is shown.
  label(value) {
    const airport = this.lookup(value);

    if (!airport) {
      return String(value || "");
    }

    return airport.c + " - " + airport.n;
  },

  // The town an airport is IN, which is not always the city it serves.
  // Used for matching a flight to a trip stop, where close enough beats
  // exactly right - see TripMap.flightServesLeg.
  cityOf(value) {
    const airport = this.lookup(value);

    return airport ? airport.m : "";
  },

  coordsOf(value) {
    const airport = this.lookup(value);

    return airport ? [airport.y, airport.x] : null;
  },

  // Ranked text search over code, name and town.
  //
  // Ranking matters more than it looks. Typing "lin" should offer Linate
  // ahead of every airport with "lin" buried in its name, and "syd" should
  // offer Sydney rather than an airstrip in a town called Sydenham. An
  // exact code always wins; after that size breaks ties, because the
  // busiest match is overwhelmingly the intended one.
  search(text, limit) {
    const query = this.normalise(text);

    if (!this._list || query.length < 2) {
      return [];
    }

    const upper = query.toUpperCase();

    const scored = [];

    this._list.forEach((airport) => {
      let score = 0;

      if (airport.c === upper) {
        score = 100;
      } else if (airport.c.indexOf(upper) === 0) {
        score = 90;
      } else if (this.normalise(airport.m) === query) {
        // Below a name match on purpose. "Sydney" is the exact
        // municipality of YQY in Nova Scotia and only part of "Sydney
        // (Mascot)" for SYD - so scoring the town above the name put a
        // Canadian regional airport ahead of the one in Australia.
        score = 65;
      } else {
        const at = airport._s.indexOf(query);

        if (at === 0) {
          score = 70;
        } else if (at > 0) {
          // A match at a word start ("... Malpensa") is a real hit. One
          // inside a word ("Berlin" for "erl") usually is not.
          score = airport._s.charAt(at - 1) === " " ? 60 : 40;
        }
      }

      if (score > 0) {
        scored.push({ airport: airport, score: score });
      }
    });

    scored.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      if (b.airport.t !== a.airport.t) {
        return b.airport.t - a.airport.t;
      }

      return a.airport.n.localeCompare(b.airport.n);
    });

    return scored.slice(0, limit || 8).map((entry) => entry.airport);
  },

  // Every airport within NEAR_KM of a point, best first - the half of the
  // problem text search cannot solve.
  near(lat, lon, options) {
    if (!this._list) {
      return [];
    }

    const opts = options || {};

    const radius = opts.km || this.NEAR_KM;

    // Airports in the country you are actually going to come first.
    // Without this, "near Singapore" offered Batam (Indonesia) and Johor
    // Bahru (Malaysia) ahead of Seletar, because both are larger - true,
    // and useless. Same trick keeps Lugano out of the top of Milan.
    const home = String(opts.country || "").trim().toUpperCase();

    const found = [];

    this._list.forEach((airport) => {
      const km = this.distanceKm(lat, lon, airport.y, airport.x);

      if (km <= radius) {
        found.push({ airport: airport, km: km });
      }
    });

    // Distance alone would put a grass strip 5 km out above the
    // international airport 40 km out. Size leads and distance breaks ties,
    // which is the order a traveller actually wants.
    found.sort((a, b) => {
      if (home) {
        const ah = a.airport.k === home ? 1 : 0;

        const bh = b.airport.k === home ? 1 : 0;

        if (ah !== bh) {
          return bh - ah;
        }
      }

      if (b.airport.t !== a.airport.t) {
        return b.airport.t - a.airport.t;
      }

      return a.km - b.km;
    });

    return found.slice(0, opts.limit || 6).map((entry) => {
      // Distance is about this search, not about the airport, so it is
      // returned on a copy rather than written onto the shared record.
      const copy = {};

      Object.keys(entry.airport).forEach((key) => {
        copy[key] = entry.airport[key];
      });

      copy.km = Math.round(entry.km);

      return copy;
    });
  },

  // Haversine. Good to a few metres at these distances, and needs no
  // projection or library.
  distanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;

    const rad = (d) => (d * Math.PI) / 180;

    const dLat = rad(lat2 - lat1);

    const dLon = rad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
};
