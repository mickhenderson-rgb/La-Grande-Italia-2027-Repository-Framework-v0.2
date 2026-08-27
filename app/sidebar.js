/*
=========================================================

COMPASS-TOS

Sidebar

Version 1.0.0

=========================================================
*/

const Sidebar = {
  menu: [
    {
      id: "dashboard",
      icon: "🏠",
      title: "Dashboard",
    },

    {
      id: "planner",
      icon: "🧭",
      title: "Planner",
    },

    {
      id: "itinerary",
      icon: "📋",
      title: "Itinerary",
    },

    {
      id: "map",
      icon: "🗺",
      title: "Trip Map",
    },

    {
      id: "destinations",
      icon: "📍",
      title: "Destinations",
    },

    {
      id: "accommodation",
      icon: "🛏",
      title: "Accommodation",
    },

    {
      id: "flights",
      icon: "✈",
      title: "Flights",
    },

    {
      id: "transport",
      icon: "🚗",
      title: "Transport",
    },

    {
      id: "readiness",
      icon: "✓",
      title: "Readiness",
    },

    {
      id: "budget",
      icon: "💰",
      title: "Budget",
    },

    {
      id: "currency",
      icon: "💱",
      title: "Currency",
    },

    {
      id: "journal",
      icon: "📔",
      title: "Journal",
    },

    {
      id: "guide",
      icon: "📖",
      title: "Travel Guide",
    },

    {
      id: "settings",
      icon: "⚙",
      title: "Settings",
    },
  ],

  // Mobile bottom-bar: the four primary destinations (+ a "More" button).
  // Shown only on narrow screens; the desktop sidebar is unchanged.
  // THREE destinations on the bottom bar, not four.
  //
  // Four plus More made five tabs around a centre capture button, which
  // put two on its left and three on its right - so the button that's
  // meant to be the middle of the bar visibly wasn't. Three plus More is
  // two either side, and the capture button lands where the eye and the
  // thumb both expect it.
  //
  // Which three depends on where the trip is up to. Planner matters while
  // you're building the trip; once you're on it, the map and the journal
  // do. Whatever isn't on the bar is always in the More sheet - see
  // visibleMoreGroups - so nothing becomes unreachable.
  mobilePrimaryByPhase: {
    Planning: ["dashboard", "planner", "map"],

    Travel: ["dashboard", "map", "journal"],

    Journal: ["dashboard", "journal", "map"],
  },

  // Every destination that can appear on the bar, in the order the More
  // sheet should list the ones that currently don't.
  mobileSwappable: ["dashboard", "planner", "map", "journal"],

  mobilePrimary() {
    const phase = typeof Phase !== "undefined" ? Phase.current() : "Planning";

    return this.mobilePrimaryByPhase[phase] || this.mobilePrimaryByPhase.Planning;
  },

  // Shorter labels for the cramped bottom bar.
  mobileLabels: { dashboard: "Home", map: "Map" },

  // Everything not on the bottom bar, grouped for the "More" sheet.
  moreGroups: [
    { title: "Plan", ids: ["itinerary", "destinations", "accommodation", "flights", "transport", "readiness"] },
    { title: "Money", ids: ["budget", "currency"] },
    { title: "App", ids: ["guide", "settings"] },
  ],

  // A "guest" share sees the trip plan, route and activities - never
  // money. These two pages are hidden from a guest's nav entirely (the
  // server also blocks the underlying data, so this is a UX nicety, not
  // the real access boundary).
  guestHiddenIds: ["budget", "currency"],

  visibleMenu() {
    if (Project.currentPermission !== "guest") {
      return this.menu;
    }

    return this.menu.filter((item) => !this.guestHiddenIds.includes(item.id));
  },

  visibleMoreGroups() {
    const visibleIds = this.visibleMenu().map((item) => item.id);

    // Which of the four main destinations the current phase left OFF the
    // bottom bar. Without this they'd be unreachable on a phone the moment
    // the phase changed - the bar swaps Planner out for Journal once
    // you're travelling, and the trip isn't over, so Planner still has to
    // be somewhere.
    const onBar = this.mobilePrimary();

    const displaced = this.mobileSwappable.filter((id) => onBar.indexOf(id) === -1 && visibleIds.includes(id));

    const groups = displaced.length > 0 ? [{ title: "Trip", ids: displaced }] : [];

    return groups.concat(
      this.moreGroups
        .map((group) => ({ title: group.title, ids: group.ids.filter((id) => visibleIds.includes(id)) }))
        .filter((group) => group.ids.length > 0),
    );
  },

  render() {
    let html = `

<aside class="sidebar">

    <div class="sidebar-logo">

        <h2>COMPASS</h2>

        <p>Travel OS</p>

    </div>

    <nav class="sidebar-menu">

`;

    this.visibleMenu().forEach((item) => {
      html += `

<button
    class="sidebar-button"
    onclick="Router.navigate('${item.id}')">

    <span class="sidebar-icon">

        ${item.icon}

    </span>

    <span class="sidebar-text">

        ${item.title}

    </span>

</button>

`;
    });

    html += `

    </nav>

    <div class="sidebar-footer">

        <div id="save-status" class="save-status">Ready</div>

        <a href="#" class="switch-trip-link" onclick="Landing.open(); return false;">Switch Trip</a>

        <a href="#" class="switch-trip-link" onclick="Auth.logout(); return false;">Log Out</a>

        Version ${typeof APP_VERSION !== "undefined" ? APP_VERSION : "1.0"}

    </div>

</aside>

`;

    return html;
  },

  // --- Mobile bottom navigation (Build 51) ---

  renderBottomBar() {
    const current = String(Router.currentPage || "dashboard").toLowerCase();

    const primaryIds = this.mobilePrimary();

    const onPrimary = primaryIds.includes(current);

    const renderTab = (item) => {
      const label = this.mobileLabels[item.id] || item.title;

      return `

<button class="mnav-tab ${current === item.id ? "is-active" : ""}" onclick="Sidebar.closeMore(); Router.navigate('${item.id}')">

    <span class="mnav-icon">${item.icon}</span>

    <span class="mnav-label">${label}</span>

</button>

`;
    };

    const primaryItems = primaryIds
      .map((id) => this.menu.find((m) => m.id === id))
      .filter(Boolean);

    // Two either side of the capture button, matching mobile.css's
    // 5-column grid: tab, tab, FAB, tab, More.
    const leftTabs = primaryItems.slice(0, 2).map(renderTab).join("");

    const rightTabs = primaryItems.slice(2).map(renderTab).join("");

    return `

<nav class="mobile-nav">

    ${leftTabs}

    <div class="mnav-fab">
        <button type="button" onclick="Capture.open()" aria-label="Capture">${Phase.current() === "Travel" ? "📷" : "＋"}</button>
    </div>

    ${rightTabs}

    <button class="mnav-tab ${onPrimary ? "" : "is-active"}" onclick="Sidebar.toggleMore()">

        <span class="mnav-icon">☰</span>

        <span class="mnav-label">More</span>

    </button>

</nav>

`;
  },

  renderMoreSheet() {
    const row = (item) =>
      item
        ? `<button class="more-row" onclick="Sidebar.closeMore(); Router.navigate('${item.id}')"><span class="more-ic">${item.icon}</span><span>${item.title}</span></button>`
        : "";

    const groups = this.visibleMoreGroups()
      .map(
        (g) => `

<div class="more-grp">${g.title}</div>

${g.ids.map((id) => row(this.menu.find((m) => m.id === id))).join("")}

`,
      )
      .join("");

    return `

<div id="more-sheet" class="more-sheet">

    <div class="more-scrim" onclick="Sidebar.closeMore()"></div>

    <div class="more-panel">

        <div class="more-handle"></div>

        <div class="more-title">More</div>

        ${groups}

        <div class="more-grp">Account</div>

        <button class="more-row" onclick="Sidebar.closeMore(); Landing.open();"><span class="more-ic">🧳</span><span>Switch Trip</span></button>

        <button class="more-row more-danger" onclick="Auth.logout()"><span class="more-ic">⏻</span><span>Log Out</span></button>

    </div>

</div>

`;
  },

  toggleMore() {
    const sheet = document.getElementById("more-sheet");

    if (sheet) {
      sheet.classList.toggle("is-open");
    }
  },

  closeMore() {
    const sheet = document.getElementById("more-sheet");

    if (sheet) {
      sheet.classList.remove("is-open");
    }
  },
};
