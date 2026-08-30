/*
=========================================================

COMPASS-TOS

Router

Version 2.1.0

=========================================================
*/

const Router = {
  currentPage: "dashboard",

  // options.silent - do not touch the URL. Used when routing FROM a
  // popstate, where the browser has already moved and pushing again would
  // add a second entry for one press of Back.
  navigate(page, options) {
    // Asked here as well as in Render.show so that declining to leave an
    // unsaved form doesn't leave currentPage pointing at a screen we never
    // actually rendered. Agreeing releases the guard, so this never
    // prompts twice for one gesture.
    if (typeof FormGuard !== "undefined" && !FormGuard.confirmLeave()) {
      return;
    }

    this.currentPage = page;

    if (!(options && options.silent)) {
      this.syncUrl(page);
    }

    switch ((page || "").toLowerCase()) {
      case "dashboard":
        Render.show(Layout.render(Dashboard.render()));

        Dashboard.initialise();

        break;

      case "planner":
        Render.show(Layout.render(Planner.render()));

        break;

      case "map":
        TripMap.open();

        break;

      case "itinerary":
        ItineraryImport.open();

        break;

      case "currency":
        Currency.open();

        break;

      case "accommodation":
        Accommodation.openAll();

        break;

      case "transport":
        Transport.openAll();

        break;

      case "readiness":
        Readiness.open();

        break;

      case "budget":
        Budget.open();

        break;

      case "journal":
        Journal.open();

        break;

      case "guide":
        Guide.open();

        break;

      case "participants":
        Participants.open();

        break;

      case "settings":
        Settings.open();

        break;

      case "flights":
        Flights.openAll();

        break;

      case "destinations":
        Destination.openList();

        break;

      default:
        Render.show(Layout.render(Dashboard.render()));

        Dashboard.initialise();

        break;
    }
  },

  // =========================================================
  // URL SYNC (BUG-003)
  //
  // Until v1.23.0 every screen lived at the same URL. Back skipped the
  // whole in-app session and landed wherever the tab had been before it;
  // refreshing dropped you at the trip list however deep you were; and no
  // section could be linked to or bookmarked.
  //
  // WHY THE HASH, not the History API's path form. The app is served from
  // /TOS/ on shared LiteSpeed hosting with no rewrite rules, so a real
  // path like /TOS/budget would 404 on refresh - the one moment this is
  // supposed to fix. A hash never reaches the server.
  //
  // THE TRIP IS IN THE URL TOO. "#budget" alone cannot survive a reload,
  // because nothing remembers which trip was open - Data.loadProject is
  // called once, from the trip list, and that is it. So:
  //
  //   #                          the trip list
  //   #/la-grande-italia-2027    that trip's dashboard
  //   #/la-grande-italia-2027/budget
  //
  // which also gives the review what it asked for: a link to "the Budget
  // page for this trip" that another person can open.
  // =========================================================

  // The URL as it stands. Kept so a declined popstate can be undone -
  // by then the browser has already moved, and there is nothing else to
  // put back.
  _url: null,

  // True while routing FROM a popstate, so navigate() knows not to push a
  // new entry for a move the browser has already made.
  _popping: false,

  hashFor(page) {
    const trip = typeof Data !== "undefined" ? Data.currentProjectFolder : null;

    if (!trip) {
      return "#";
    }

    return "#/" + trip + (page && page !== "dashboard" ? "/" + page : "");
  },

  parseHash(hash) {
    const raw = String(hash || "").replace(/^#\/?/, "");

    if (!raw) {
      return { trip: null, page: "dashboard" };
    }

    const parts = raw.split("/").filter(Boolean);

    return { trip: parts[0] || null, page: parts[1] || "dashboard" };
  },

  // Back to the trip list, which is "#" - no trip, no section.
  clearUrl() {
    if (typeof window === "undefined" || !window.history) {
      return;
    }

    try {
      window.history.pushState({ page: null }, "", "#");
    } catch (error) {
      return;
    }

    this._url = "#";

    this.currentPage = "dashboard";
  },

  syncUrl(page) {
    if (typeof window === "undefined" || !window.history) {
      return;
    }

    const next = this.hashFor(page);

    // Replacing rather than pushing when nothing moved keeps Back from
    // needing several presses to leave a screen you only re-rendered.
    const same = this._url === next;

    try {
      if (same) {
        window.history.replaceState({ page: page }, "", next);
      } else {
        window.history.pushState({ page: page }, "", next);
      }
    } catch (error) {
      // Some embedded webviews refuse pushState on a file:// origin. The
      // app works without it; only Back and refresh lose their memory.
      return;
    }

    this._url = next;
  },

  // The browser has already moved by the time this runs, which is what
  // makes the unsaved-changes case awkward: declining has to put the URL
  // back rather than simply not going.
  onPopState(event) {
    const target = this.parseHash(window.location.hash);

    if (typeof FormGuard !== "undefined" && !FormGuard.confirmLeave()) {
      if (this._url && window.history) {
        window.history.pushState({ page: this.currentPage }, "", this._url);
      }

      return;
    }

    this._url = window.location.hash || "#";

    const openTrip = typeof Data !== "undefined" ? Data.currentProjectFolder : null;

    // Back out of a trip entirely.
    if (!target.trip) {
      this._popping = true;

      Landing.open();

      this._popping = false;

      return;
    }

    // Back into a DIFFERENT trip - it has to be loaded before the section
    // can render, and loading is async, so this cannot just fall through.
    if (target.trip !== openTrip) {
      this._popping = true;

      Data.loadProject(target.trip)
        .then(() => {
          Dates.recalculateJourney();

          this.navigate(target.page, { silent: true });
        })
        .catch(() => {
          Landing.open();
        })
        .then(() => {
          this._popping = false;
        });

      return;
    }

    this._popping = true;

    this.navigate(target.page, { silent: true });

    this._popping = false;
  },

  // Called once on boot, after sign-in. Decides between the trip list and
  // deep-linking straight into a section.
  async start() {
    if (typeof window !== "undefined") {
      window.addEventListener("popstate", (event) => this.onPopState(event));
    }

    const target = this.parseHash(window.location.hash);

    if (!target.trip) {
      Landing.open();

      return;
    }

    try {
      await Data.loadProject(target.trip);

      Dates.recalculateJourney();

      this.navigate(target.page);
    } catch (error) {
      // A link to a trip that has been deleted, or that this account
      // cannot see. The trip list is the honest place to land.
      console.warn("Could not open the trip named in the URL:", target.trip, error);

      Landing.open();
    }
  },
};
