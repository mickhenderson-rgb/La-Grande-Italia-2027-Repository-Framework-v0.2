/*
=========================================================

COMPASS-TOS

UI

Version 1.0.0

Telling the person something, and asking them something.
The two jobs alert() and confirm() were doing in 60 and 13
places respectively.

WHY THIS EXISTS

Not because native dialogs are ugly. Because they can be
INVISIBLE. A UX review of this app ran in a browser that
suppresses JS dialogs - which managed corporate browsers,
some in-app webviews and every automation tool do - and
submitting a form with a required field blank produced
nothing at all. No message, no focus change, nothing. The
form just sat there. The console recorded "Page dialog
suppressed (alert)" and the person at the keyboard saw a
screen that appeared to have ignored them.

They also block the whole tab while open, cannot be styled
for dark mode or high contrast, and interrupt a screen
reader rather than being announced in place.

THREE THINGS, NOT ONE

  warn()     something is wrong with what you just typed.
             Belongs NEXT TO THE FIELD, and moves focus
             there.

  fail()     something we tried to do for you did not work,
             usually after a network call, often when the
             form has already closed. Belongs on screen as
             a whole, because there may be no form left.

  confirm()  a question that has to be answered before
             anything happens.

warn() falls back to a toast when a form has no message
slot, so migrating a call site is always safe: it is never
worse than what it replaced, and gets better when a slot is
added.

=========================================================
*/

const UI = {
  // Long enough to read a sentence, short enough not to linger. Failures
  // stay put until dismissed - they usually mean something did not save,
  // and that should not evaporate while you are looking away.
  TOAST_MS: 5000,

  _toastTimer: null,

  _lastFocus: null,

  // --- Telling ---------------------------------------------------------

  // Something is wrong with the form in front of you.
  //
  // opts.slot   id of an inline message element to write into
  // opts.focus  id of the field to put the cursor back in
  //
  // With no slot it becomes a toast rather than nothing, which is the
  // point: every call site is safe to migrate before its form has a slot.
  warn(text, opts) {
    const options = opts || {};

    const slot = options.slot ? document.getElementById(options.slot) : null;

    if (slot) {
      slot.textContent = text;

      slot.className = "ui-msg is-warn";

      slot.hidden = false;
    } else {
      this.toast(text, "warn");
    }

    const field = options.focus ? document.getElementById(options.focus) : null;

    if (field && typeof field.focus === "function") {
      field.focus();

      if (typeof field.select === "function" && field.value) {
        field.select();
      }
    }
  },

  // Something we tried to do did not work. Almost always from a .catch(),
  // and by then the form may be gone - so this is always a toast.
  fail(text) {
    this.toast(text, "fail");
  },

  // Something worked, and it is not obvious from the screen that it did.
  ok(text) {
    this.toast(text, "ok");
  },

  clear(slotId) {
    const slot = document.getElementById(slotId);

    if (slot) {
      slot.textContent = "";

      slot.hidden = true;
    }
  },

  toast(text, tone) {
    const host = this.toastHost();

    // role=alert interrupts a screen reader, which is right for a failure
    // and rude for a confirmation. status waits its turn.
    host.setAttribute("role", tone === "fail" ? "alert" : "status");

    host.className = "ui-toast is-" + (tone || "ok");

    host.innerHTML = "";

    const message = document.createElement("span");

    message.className = "ui-toast-text";

    // textContent, not innerHTML - some of these carry a server's error
    // string, and none of them should be able to bring markup with it.
    message.textContent = text;

    host.appendChild(message);

    const close = document.createElement("button");

    close.type = "button";

    close.className = "ui-toast-close";

    close.setAttribute("aria-label", "Dismiss");

    close.textContent = "×";

    close.onclick = () => this.hideToast();

    host.appendChild(close);

    host.hidden = false;

    if (this._toastTimer) {
      clearTimeout(this._toastTimer);

      this._toastTimer = null;
    }

    // A failure stays until dismissed. It usually means something did not
    // save, and that must not disappear while you are looking elsewhere.
    if (tone !== "fail") {
      this._toastTimer = setTimeout(() => this.hideToast(), this.TOAST_MS);
    }
  },

  hideToast() {
    const host = document.getElementById("ui-toast");

    if (host) {
      host.hidden = true;
    }

    if (this._toastTimer) {
      clearTimeout(this._toastTimer);

      this._toastTimer = null;
    }
  },

  // Created once and reused. Render.show() replaces the page body on every
  // navigation, so this lives on <body> directly rather than inside the
  // page content - otherwise a toast raised by a save would vanish with
  // the re-render that follows it.
  toastHost() {
    let host = document.getElementById("ui-toast");

    if (!host) {
      host = document.createElement("div");

      host.id = "ui-toast";

      host.className = "ui-toast";

      host.hidden = true;

      document.body.appendChild(host);
    }

    return host;
  },

  // --- Asking ----------------------------------------------------------

  // Replaces confirm(). Callback rather than a return value, because a
  // real dialog cannot block the thread the way the native one does.
  //
  //   UI.confirm({
  //     title: "Remove this flight?",
  //     body: "This cannot be undone.",
  //     confirmLabel: "Remove",
  //     tone: "danger",
  //     onConfirm: () => { ... },
  //   })
  //
  // Modelled on the two-step trip-delete screen, which was built once for
  // trips and never generalised - so trip deletion had a proper
  // confirmation and removing a booking got a browser popup.
  confirm(options) {
    const opts = options || {};

    this.closeConfirm();

    // Remembered so focus can go back where it came from. Losing your
    // place in the page after dismissing a dialog is the classic keyboard
    // and screen-reader failure.
    this._lastFocus = document.activeElement;

    const backdrop = document.createElement("div");

    backdrop.className = "ui-modal-backdrop";

    backdrop.id = "ui-confirm";

    const box = document.createElement("div");

    box.className = "ui-modal" + (opts.tone === "danger" ? " is-danger" : "");

    box.setAttribute("role", "dialog");

    box.setAttribute("aria-modal", "true");

    box.setAttribute("aria-labelledby", "ui-confirm-title");

    const heading = document.createElement("h2");

    heading.id = "ui-confirm-title";

    heading.className = "ui-modal-title";

    heading.textContent = opts.title || "Are you sure?";

    box.appendChild(heading);

    if (opts.body) {
      const body = document.createElement("p");

      body.className = "ui-modal-body";

      body.textContent = opts.body;

      box.appendChild(body);
    }

    const actions = document.createElement("div");

    actions.className = "ui-modal-actions";

    const cancel = document.createElement("button");

    cancel.type = "button";

    cancel.className = "ui-modal-cancel";

    cancel.textContent = opts.cancelLabel || "Cancel";

    const go = document.createElement("button");

    go.type = "button";

    go.className = "ui-modal-go" + (opts.tone === "danger" ? " is-danger" : "");

    go.textContent = opts.confirmLabel || "Yes";

    // Cancel first in the DOM so it is the first thing Tab reaches and the
    // first thing a screen reader reads. On a destructive question the
    // safe answer should be the easy one.
    actions.appendChild(cancel);

    actions.appendChild(go);

    box.appendChild(actions);

    backdrop.appendChild(box);

    document.body.appendChild(backdrop);

    const close = () => this.closeConfirm();

    cancel.onclick = () => {
      close();

      if (typeof opts.onCancel === "function") {
        opts.onCancel();
      }
    };

    go.onclick = () => {
      close();

      if (typeof opts.onConfirm === "function") {
        opts.onConfirm();
      }
    };

    // Clicking the dark area is a cancel, not a confirm. Clicking INSIDE
    // the box must not count, which is what the target check is for.
    backdrop.onclick = (event) => {
      if (event.target === backdrop) {
        cancel.onclick();
      }
    };

    backdrop.onkeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();

        cancel.onclick();

        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      // Focus trap. Without it, Tab walks out of the dialog and into the
      // page behind it, which is still there and still clickable to a
      // keyboard user even though it looks disabled.
      const focusables = [cancel, go];

      const index = focusables.indexOf(document.activeElement);

      event.preventDefault();

      const next = event.shiftKey
        ? (index <= 0 ? focusables.length - 1 : index - 1)
        : (index === focusables.length - 1 ? 0 : index + 1);

      focusables[next].focus();
    };

    // The SAFE button, deliberately. A confirmation that opens with the
    // destructive option under the cursor is not much of a confirmation.
    cancel.focus();
  },

  closeConfirm() {
    const existing = document.getElementById("ui-confirm");

    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }

    if (this._lastFocus && typeof this._lastFocus.focus === "function") {
      // Wrapped: the element it came from may no longer be in the document
      // if the action re-rendered the page.
      try {
        this._lastFocus.focus();
      } catch (error) {
        /* the page moved on - nothing to return to */
      }
    }

    this._lastFocus = null;
  },
};
