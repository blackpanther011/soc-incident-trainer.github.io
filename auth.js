// ============================================================
// SOC TRAINER v5 — Local Operator Profiles (login / register)
//
// SCOPE & THREAT MODEL — read before extending:
// This is a CLIENT-ONLY app. These profiles separate training
// progress (XP, history) between operators sharing a browser.
// Passcodes are PBKDF2-hashed (Web Crypto, 210k iters) so they
// are never stored or recoverable in plaintext — but anyone with
// device access can still edit localStorage. This is NOT real
// authentication; multi-user deployments need a backend.
// ============================================================

const USERS_KEY = "soc_trainer_users_v1";
const SESSION_KEY = "soc_trainer_session_v1";
const PBKDF2_ITER = 210_000;

const $ = (id) => document.getElementById(id);

// ─── Crypto helpers ──────────────────────────────────────────
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function hashPasscode(passcode, saltBytes) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(passcode), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations: PBKDF2_ITER, hash: "SHA-256" },
    keyMaterial, 256);
  return b64(bits);
}

// constant-time-ish compare (lengths are fixed here anyway)
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ─── User store ──────────────────────────────────────────────
function loadUsers() {
  try {
    const u = JSON.parse(localStorage.getItem(USERS_KEY) || "{}");
    return u && typeof u === "object" && !Array.isArray(u) ? u : {};
  } catch (_) { return {}; }
}
function saveUsers(users) {
  try { localStorage.setItem(USERS_KEY, JSON.stringify(users)); } catch (_) {}
}

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,24}$/;

export const Auth = {
  _user: null, // null = guest

  user() { return this._user; },

  /** Namespace a storage key per profile. Guests keep the legacy keys. */
  key(base) { return this._user ? `${base}@${this._user}` : base; },

  async register(username, passcode) {
    if (!crypto?.subtle) throw new Error("Profiles need a secure context (serve over localhost or HTTPS).");
    username = (username || "").trim();
    if (!USERNAME_RE.test(username)) throw new Error("Callsign: 3–24 chars, letters/digits/._- only.");
    if ((passcode || "").length < 6) throw new Error("Passcode must be at least 6 characters.");
    const users = loadUsers();
    if (users[username.toLowerCase()]) throw new Error("That callsign is already registered.");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await hashPasscode(passcode, salt);
    users[username.toLowerCase()] = { name: username, salt: b64(salt), hash, iter: PBKDF2_ITER, created: Date.now() };
    saveUsers(users);
    this._setSession(username);
  },

  async login(username, passcode) {
    if (!crypto?.subtle) throw new Error("Profiles need a secure context (serve over localhost or HTTPS).");
    const rec = loadUsers()[(username || "").trim().toLowerCase()];
    if (!rec) throw new Error("Unknown callsign.");
    const hash = await hashPasscode(passcode || "", fromB64(rec.salt));
    if (!safeEqual(hash, rec.hash)) throw new Error("Passcode incorrect.");
    this._setSession(rec.name);
  },

  loginAsGuest() { this._setSession(null); },

  logout() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
    location.reload();
  },

  _setSession(name) {
    this._user = name;
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user: name })); } catch (_) {}
  },

  /**
   * Resolves once an operator is chosen (restored session, login,
   * register, or guest). app.js awaits this before initializing.
   */
  ready() {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
      if (s && typeof s === "object") {
        this._user = typeof s.user === "string" ? s.user : null;
        this._mountChip();
        return Promise.resolve();
      }
    } catch (_) {}
    return new Promise((resolve) => this._showModal(resolve));
  },

  // ─── HUD operator chip ─────────────────────────────────────
  _mountChip() {
    const right = document.querySelector(".hud-right");
    if (!right || $("operatorChip")) return;
    const chip = document.createElement("button");
    chip.id = "operatorChip";
    chip.className = "operator-chip";
    chip.title = this._user ? "Sign out" : "Playing as guest — sign in to keep a separate record";
    chip.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1"/></svg>
      <span>${this._user ? esc(this._user) : "GUEST"}</span>
      <small>${this._user ? "SIGN OUT" : "SIGN IN"}</small>`;
    chip.onclick = () => {
      if (this._user) { if (confirm(`Sign out ${this._user}?`)) this.logout(); }
      else { try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {} location.reload(); }
    };
    right.insertBefore(chip, right.firstChild);
  },

  // ─── Login modal ───────────────────────────────────────────
  _showModal(resolve) {
    const hasUsers = Object.keys(loadUsers()).length > 0;
    let mode = hasUsers ? "login" : "register";
    const wrap = document.createElement("div");
    wrap.className = "auth-overlay";
    wrap.innerHTML = `
      <div class="auth-modal" role="dialog" aria-modal="true" aria-label="Operator sign in">
        <div class="auth-mk"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
        <div class="auth-title">OPERATOR AUTHENTICATION</div>
        <div class="auth-sub">Profiles keep XP, ranks and operation history separate on this machine.</div>
        <div class="auth-tabs">
          <button type="button" data-m="login" class="${mode === "login" ? "on" : ""}">Sign In</button>
          <button type="button" data-m="register" class="${mode === "register" ? "on" : ""}">Register</button>
        </div>
        <form class="auth-form" novalidate>
          <label>CALLSIGN<input name="user" class="input" autocomplete="username" spellcheck="false" maxlength="24" placeholder="e.g. night_owl" /></label>
          <label>PASSCODE<input name="pass" class="input" type="password" autocomplete="current-password" maxlength="64" placeholder="min 6 characters" /></label>
          <div class="auth-err" hidden></div>
          <button type="submit" class="btn btn-primary auth-go">Sign In</button>
        </form>
        <button type="button" class="auth-guest">Continue as Guest →</button>
        <div class="auth-note">Local profiles only — passcodes are hashed and never leave this browser.</div>
      </div>`;
    document.body.appendChild(wrap);

    const form = wrap.querySelector(".auth-form");
    const errEl = wrap.querySelector(".auth-err");
    const goBtn = wrap.querySelector(".auth-go");
    const setMode = (m) => {
      mode = m;
      wrap.querySelectorAll(".auth-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.m === m));
      goBtn.textContent = m === "login" ? "Sign In" : "Create Profile";
      form.pass.autocomplete = m === "login" ? "current-password" : "new-password";
      errEl.hidden = true;
    };
    wrap.querySelectorAll(".auth-tabs button").forEach((b) => { b.onclick = () => setMode(b.dataset.m); });
    setMode(mode);

    const finish = () => { wrap.remove(); this._mountChip(); resolve(); };
    form.onsubmit = async (e) => {
      e.preventDefault();
      errEl.hidden = true; goBtn.disabled = true;
      try {
        if (mode === "login") await this.login(form.user.value, form.pass.value);
        else await this.register(form.user.value, form.pass.value);
        finish();
      } catch (err) {
        errEl.textContent = err.message; errEl.hidden = false; goBtn.disabled = false;
      }
    };
    wrap.querySelector(".auth-guest").onclick = () => { this.loginAsGuest(); finish(); };
    setTimeout(() => form.user.focus(), 50);
  },
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
