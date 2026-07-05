/*
=========================================================

COMPASS-TOS

Render Engine

Sprint 1.1

=========================================================
*/

const Render = {
  target: "app",

  show(html) {
    const app = document.getElementById(this.target);

    if (!app) {
      console.error("Render target not found.");

      return;
    }

    app.innerHTML = html;
  },

  clear() {
    const app = document.getElementById(this.target);

    if (app) {
      app.innerHTML = "";
    }
  },
};
