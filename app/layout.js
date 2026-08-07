/*
=========================================================

COMPASS-TOS

Layout Manager

Version 1.1.0

Build 46

Wraps page content with the sidebar, header and footer.
The header title is pulled live from the currently loaded
trip (project.name) on every render, and the browser tab
title is kept in sync too - so switching trips, or editing a
trip's name, is reflected everywhere without any hardcoding.

=========================================================
*/

const Layout = {
  tripName() {
    const project = Project.get("project");

    const name = project && project.project ? project.project.name : "";

    return name && String(name).trim() ? String(name).trim() : "My Trip";
  },

  esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  render(content) {
    const name = this.tripName();

    // Keep the browser tab title in sync with the current trip on every
    // in-trip page render (dashboard, planner, budget, etc.).
    document.title = `${name} – COMPASS-TOS`;

    return `

<div class="app-layout">

    ${Sidebar.render()}

    <main class="app-main">

        <header class="app-header">

            <div class="app-title">

                ${this.esc(name)}

            </div>

            <div class="app-actions">

                <button id="themeButton">

                    🌙 Theme

                </button>

            </div>

        </header>

        <section class="app-content">

            ${content}

        </section>

        <footer class="app-footer">

            Ready

        </footer>

    </main>

</div>

`;
  },
};
