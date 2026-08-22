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
  mobilePrimary: ["dashboard", "planner", "map", "journal"],

  // Shorter labels for the cramped bottom bar.
  mobileLabels: { dashboard: "Home", map: "Map" },

  // Everything not on the bottom bar, grouped for the "More" sheet.
  moreGroups: [
    { title: "Plan", ids: ["itinerary", "destinations", "accommodation", "flights", "transport"] },
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

    return this.moreGroups
      .map((group) => ({ title: group.title, ids: group.ids.filter((id) => visibleIds.includes(id)) }))
      .filter((group) => group.ids.length > 0);
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

        Version 1.0

    </div>

</aside>

`;

    return html;
  },

  // --- Mobile bottom navigation (Build 51) ---

  renderBottomBar() {
    const current = String(Router.currentPage || "dashboard").toLowerCase();

    const onPrimary = this.mobilePrimary.includes(current);

    const tabs = this.mobilePrimary
      .map((id) => this.menu.find((m) => m.id === id))
      .filter(Boolean)
      .map((item) => {
        const label = this.mobileLabels[item.id] || item.title;

        return `

<button class="mnav-tab ${current === item.id ? "is-active" : ""}" onclick="Sidebar.closeMore(); Router.navigate('${item.id}')">

    <span class="mnav-icon">${item.icon}</span>

    <span class="mnav-label">${label}</span>

</button>

`;
      })
      .join("");

    return `

<nav class="mobile-nav">

    ${tabs}

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
