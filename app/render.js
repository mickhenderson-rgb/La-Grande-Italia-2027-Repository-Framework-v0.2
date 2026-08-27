/*
=========================================================

COMPASS-TOS

Render Engine

Sprint 1.1

=========================================================
*/

const Render = {
  target: "app",

  // Returns false if the render was refused - every screen change in the
  // app goes through here, so this is the one place that can catch a page
  // about to replace a form with unsaved changes in it. That includes the
  // module-internal navigations (a Cancel button calling openAll()) that
  // never touch the Router.
  show(html) {
    const app = document.getElementById(this.target);

    if (!app) {
      console.error("Render target not found.");

      return false;
    }

    if (typeof FormGuard !== "undefined" && !FormGuard.confirmLeave()) {
      return false;
    }

    app.innerHTML = html;

    if (typeof FormGuard !== "undefined") {
      FormGuard.refresh();
    }

    return true;
  },

  clear() {
    const app = document.getElementById(this.target);

    if (app) {
      app.innerHTML = "";
    }
  },
};
