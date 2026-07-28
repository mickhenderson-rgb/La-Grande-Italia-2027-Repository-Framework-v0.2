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

  render() {
    let html = `

<aside class="sidebar">

    <div class="sidebar-logo">

        <h2>COMPASS</h2>

        <p>Travel OS</p>

    </div>

    <nav class="sidebar-menu">

`;

    this.menu.forEach((item) => {
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

        Version 1.0

    </div>

</aside>

`;

    return html;
  },
};
