/*
=========================================================

COMPASS-TOS

Form Guard (unsaved changes)

Version 1.0.0

Stops half-finished bookings disappearing without a word.

The app is mostly data entry, and every screen change goes
through Render.show() replacing the whole page - so until
now, typing three fields of a hotel booking and then
touching the sidebar, a Cancel button, or a stray back
swipe on a phone threw the lot away silently.

How a form opts in: put data-guard="<key>" on the form's
wrapper element. The key identifies THAT form and item,
e.g. data-guard="accommodation:abc123" or
data-guard="accommodation:new".

Why a key rather than just "is a form on screen": some
forms legitimately re-render themselves mid-edit (adding a
flight leg rebuilds the whole form). Re-rendering the SAME
key keeps the unsaved state; a different key - or no form
at all - starts fresh. Without that, adding a leg would
either nag you about leaving a page you're still on, or
quietly forget that you had unsaved work.

Dirtiness is tracked by listening for real input, not by
diffing values. A field typed into and then typed back to
its original value still counts as touched, which is the
safe way round: the worst case is one unnecessary prompt,
never a silent loss.

Saving releases the guard - see the `saving` flag in each
module.

=========================================================
*/

const FormGuard = {
  // The data-guard value of the form currently on screen, or null.
  _key: null,

  _dirty: false,

  MESSAGE: "You have unsaved changes on this form.\n\nLeave without saving?",

  // Called by Render.show() after the new page is in the DOM.
  refresh() {
    const form = document.querySelector("[data-guard]");

    if (!form) {
      this._key = null;

      this._dirty = false;

      return;
    }

    const key = form.getAttribute("data-guard");

    // Same form re-rendering itself (a flight leg added, an image
    // attached) - keep whatever unsaved state it already had.
    if (key !== this._key) {
      this._key = key;

      this._dirty = false;
    }

    // The old element went with the old innerHTML, so the listener has to
    // be reattached each render.
    //
    // data-guard-fields narrows the watch to named inputs instead of the
    // whole container. The journal needs this: its checklist and photo
    // widgets save themselves live and re-render the page, so a delegated
    // listener would mark the page dirty every time you ticked a box and
    // then nag about changes that were already saved. Only the fields the
    // page's own Save button writes should count.
    const only = form.getAttribute("data-guard-fields");

    if (!only) {
      form.addEventListener("input", this._touch);

      form.addEventListener("change", this._touch);

      return;
    }

    only.split(/\s+/).forEach((id) => {
      const field = document.getElementById(id);

      if (!field) {
        return;
      }

      field.addEventListener("input", this._touch);

      field.addEventListener("change", this._touch);
    });
  },

  // An arrow so `this` inside it is irrelevant - it's used as a bare
  // listener and only ever sets a flag on the module.
  _touch: () => {
    FormGuard._dirty = true;
  },

  isDirty() {
    return this._dirty && Boolean(document.querySelector("[data-guard]"));
  },

  // Called when a save starts, so the navigation that follows it doesn't
  // ask about changes that are on their way to the server.
  release() {
    this._dirty = false;
  },

  // True if it's OK to navigate away.
  //
  // Agreeing to leave releases the guard, which also means a single
  // gesture can't prompt twice on its way out (Router.navigate asks, then
  // Render.show would otherwise ask again).
  confirmLeave() {
    if (!this.isDirty()) {
      return true;
    }

    if (window.confirm(this.MESSAGE)) {
      this.release();

      return true;
    }

    return false;
  },
};

// Closing the tab or hitting refresh bypasses the app entirely, so this is
// the only place the browser's own prompt can help. Modern browsers ignore
// any custom text and show their own wording.
window.addEventListener("beforeunload", (event) => {
  if (!FormGuard.isDirty()) {
    return;
  }

  event.preventDefault();

  event.returnValue = "";
});
