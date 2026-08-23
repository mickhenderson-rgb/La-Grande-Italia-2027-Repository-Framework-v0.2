/*
=========================================================

COMPASS-TOS

Theme Toggle

Version 1.0.0

Swaps the #theme-style stylesheet link between
assets/css/themes/light.css and dark.css, persists the
choice in localStorage, and keeps the sidebar's Theme
button label in sync. The saved preference is also applied
by a small inline script in index.html's <head> (before
this file loads) so a returning dark-mode user doesn't see
a flash of the light theme on page load.

=========================================================
*/

const Theme = {
  STORAGE_KEY: "compass-theme",

  current() {
    try {
      return localStorage.getItem(this.STORAGE_KEY) === "dark" ? "dark" : "light";
    } catch (error) {
      return "light";
    }
  },

  buttonLabel() {
    return this.current() === "dark" ? "☀️ Light" : "🌙 Dark";
  },

  apply(mode) {
    const link = document.getElementById("theme-style");

    if (link) {
      link.setAttribute("href", `assets/css/themes/${mode}.css`);
    }

    const button = document.getElementById("themeButton");

    if (button) {
      button.textContent = mode === "dark" ? "☀️ Light" : "🌙 Dark";
    }
  },

  toggle() {
    const next = this.current() === "dark" ? "light" : "dark";

    try {
      localStorage.setItem(this.STORAGE_KEY, next);
    } catch (error) {
      // Private browsing / storage disabled - the toggle still works for
      // this page load, it just won't be remembered next visit.
    }

    this.apply(next);
  },
};
