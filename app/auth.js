/*
=========================================================

COMPASS-TOS

Auth

Version 1.0.0

Build 47

Login, registration and logout UI. Sessions are cookie-based
(set by the server); the browser sends the cookie on every
same-origin request automatically, so the rest of the app's
fetch() calls need no changes. Login is by username; email is
collected at sign-up.

=========================================================
*/

const Auth = {
  currentUser: null,

  registrationMode: "invite",

  needsBootstrap: false,

  inviteToken: "",

  async check() {
    try {
      const response = await fetch(`${window.API_BASE}/auth/me`);

      const data = await response.json();

      this.currentUser = data.user || null;

      this.registrationMode = data.registrationMode || "invite";

      this.needsBootstrap = !!data.needsBootstrap;

      return data;
    } catch (error) {
      this.currentUser = null;

      return { user: null };
    }
  },

  showLogin() {
    Render.show(this.renderLogin());
  },

  showRegister(inviteToken) {
    this.inviteToken = inviteToken || "";

    Render.show(this.renderRegister());
  },

  renderLogin() {
    return `

<div class="landing">

    <div class="landing-card" style="max-width: 380px; text-align: left;">

        <h1 style="text-align: center;">COMPASS-TOS</h1>

        <p class="muted" style="text-align: center;">Sign in to your trips</p>

        <label class="form-field form-field-wide">
            Username
            <input type="text" id="auth-username" autocomplete="username" onkeydown="if(event.key==='Enter')Auth.login()">
        </label>

        <label class="form-field form-field-wide">
            Password
            <input type="password" id="auth-password" autocomplete="current-password" onkeydown="if(event.key==='Enter')Auth.login()">
        </label>

        <div id="auth-msg" class="form-hint" style="min-height: 1.2em; margin: 8px 0;"></div>

        <button type="button" style="width: 100%;" onclick="Auth.login()">Log In</button>

        <p class="muted" style="text-align: center; margin-top: 14px; font-size: 0.85em;">
            No account? You'll need an invite link to sign up.
        </p>

    </div>

</div>

`;
  },

  renderRegister() {
    const intro = this.needsBootstrap
      ? "Set up the first account. This account will own the trips already on this server."
      : this.inviteToken
        ? "You've been invited - create your account below."
        : "Create your account below.";

    return `

<div class="landing">

    <div class="landing-card" style="max-width: 380px; text-align: left;">

        <h1 style="text-align: center;">Create Account</h1>

        <p class="muted" style="text-align: center;">${this.esc(intro)}</p>

        <label class="form-field form-field-wide">
            Username
            <input type="text" id="reg-username" autocomplete="username" placeholder="e.g. Mick_H">
        </label>

        <label class="form-field form-field-wide">
            Email
            <input type="email" id="reg-email" autocomplete="email">
        </label>

        <label class="form-field form-field-wide">
            Password
            <input type="password" id="reg-password" autocomplete="new-password">
        </label>

        <label class="form-field form-field-wide">
            Confirm Password
            <input type="password" id="reg-confirm" autocomplete="new-password" onkeydown="if(event.key==='Enter')Auth.register()">
        </label>

        <div id="auth-msg" class="form-hint" style="min-height: 1.2em; margin: 8px 0;"></div>

        <button type="button" style="width: 100%;" onclick="Auth.register()">Create Account</button>

        <p class="muted" style="text-align: center; margin-top: 14px; font-size: 0.85em;">
            Already have an account? <a href="#" onclick="Auth.showLogin(); return false;">Log in</a>
        </p>

    </div>

</div>

`;
  },

  async login() {
    const username = document.getElementById("auth-username").value.trim();

    const password = document.getElementById("auth-password").value;

    const msg = document.getElementById("auth-msg");

    if (!username || !password) {
      msg.textContent = "Enter your username and password.";

      return;
    }

    msg.textContent = "Signing in…";

    try {
      const response = await fetch(`${window.API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        msg.textContent = data.error || "Sign-in failed.";

        return;
      }

      window.location.reload();
    } catch (error) {
      console.error("Login failed:", error);

      msg.textContent = "Couldn't reach the server. Try again.";
    }
  },

  async register() {
    const username = document.getElementById("reg-username").value.trim();

    const email = document.getElementById("reg-email").value.trim();

    const password = document.getElementById("reg-password").value;

    const confirmPassword = document.getElementById("reg-confirm").value;

    const msg = document.getElementById("auth-msg");

    msg.textContent = "Creating account…";

    try {
      const response = await fetch(`${window.API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password, confirmPassword, inviteToken: this.inviteToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        msg.textContent = data.error || "Could not create the account.";

        return;
      }

      window.location.reload();
    } catch (error) {
      console.error("Registration failed:", error);

      msg.textContent = "Couldn't reach the server. Try again.";
    }
  },

  async logout() {
    try {
      await fetch(`${window.API_BASE}/auth/logout`, { method: "POST" });
    } catch (error) {
      // Even if the request fails, fall through to reload - the cookie is
      // cleared server-side on success and the session is short-lived anyway.
      console.error("Logout request failed (reloading anyway):", error);
    }

    window.location.reload();
  },

  esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
};
