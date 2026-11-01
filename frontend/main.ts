// StayFinder frontend entry point: login, register and logout.
// Loaded as an ES module from public/index.html.

import { apiFetch, ApiError } from "./api.js";
import { clearSession, getSession, loadSession, saveSession } from "./session.js";
import { parseHash, startRouter } from "./router.js";
import {
  renderNotFound,
  renderPropertyCreate,
  renderPropertyDetail,
  renderPropertyEdit,
  renderPropertyList,
} from "./properties.js";
import { renderBookingEdit, renderBookingList } from "./bookings.js";
import { searchProperties } from "./properties.js";
import type { MeResponse, PropertyQuery, RegisterResponse, Session } from "./types.js";

// --- Small DOM helpers -------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function showMessage(container: HTMLElement, message: string, kind: "error" | "info"): void {
  container.textContent = "";
  const p = el("p", `message ${kind}`, message);
  container.append(p);
}

function setBusy(form: HTMLFormElement, busy: boolean): void {
  const button = form.querySelector("button[type='submit']");
  if (button instanceof HTMLButtonElement) {
    button.disabled = busy;
    button.textContent = busy ? "Please wait…" : button.dataset.label ?? "Submit";
  }
}

// --- Auth calls --------------------------------------------------------------

async function register(email: string, password: string): Promise<RegisterResponse> {
  return apiFetch<RegisterResponse>("/auth/register", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
}

async function login(email: string, password: string): Promise<Session> {
  const session = await apiFetch<Session>("/auth/login", {
    method: "POST",
    body: { email, password },
    auth: false,
  });
  saveSession(session);
  return session;
}

async function logout(): Promise<void> {
  const session = getSession();
  // Always clear the local session, even if the server call fails.
  try {
    if (session) {
      await apiFetch<{ message: string }>("/auth/logout", {
        method: "POST",
        body: { refresh_token: session.refresh_token },
      });
    }
  } catch {
    // The access token may already be expired; logging out locally is enough.
  } finally {
    clearSession();
  }
}

// --- Views -------------------------------------------------------------------

const app = document.querySelector<HTMLElement>("#app");
const nav = document.querySelector<HTMLElement>("#nav");
const userNav = document.querySelector<HTMLElement>("#user-nav");
const finderToggle = document.querySelector<HTMLButtonElement>("#finder-toggle");
const finderPanel = document.querySelector<HTMLElement>("#finder-panel");
const finderContent = document.querySelector<HTMLElement>("#finder-content");

// --- Finder panel (search/filter) ----------------------------------------------

let finderOpen = false;

function toggleFinder(): void {
  finderOpen = !finderOpen;
  if (finderPanel) {
    finderPanel.hidden = !finderOpen;
    finderPanel.classList.toggle("open", finderOpen);
  }
  if (finderToggle) {
    finderToggle.setAttribute("aria-expanded", String(finderOpen));
    finderToggle.classList.toggle("open", finderOpen);
  }
}

function closeFinder(): void {
  if (!finderOpen) {
    return;
  }
  finderOpen = false;
  if (finderPanel) {
    finderPanel.hidden = true;
    finderPanel.classList.remove("open");
  }
  if (finderToggle) {
    finderToggle.setAttribute("aria-expanded", "false");
    finderToggle.classList.remove("open");
  }
}

// Renders the filter form inside the finder panel.
function renderFinderPanel(onSearch: (query: PropertyQuery) => void): void {
  if (!finderContent) {
    return;
  }
  finderContent.textContent = "";

  const form = el("form", "finder-form") as HTMLFormElement;

  const whereField = el("div", "finder-field");
  const whereLabel = el("label", undefined, "Where");
  const whereInput = Object.assign(el("input"), {
    type: "text",
    name: "location",
    placeholder: "Search destinations",
  });
  whereLabel.append(whereInput);
  whereField.append(whereLabel);

  const whoField = el("div", "finder-field");
  const whoLabel = el("label", undefined, "Who");
  const whoInput = Object.assign(el("input"), {
    type: "number",
    name: "guests",
    placeholder: "Add guests",
    min: "1",
  });
  whoLabel.append(whoInput);
  whoField.append(whoLabel);

  const priceField = el("div", "finder-field");
  const priceLabel = el("label", undefined, "Max price");
  const priceInput = Object.assign(el("input"), {
    type: "number",
    name: "max_price",
    placeholder: "Max price",
    min: "1",
  });
  priceLabel.append(priceInput);
  priceField.append(priceLabel);

  const sortField = el("div", "finder-field");
  const sortLabel = el("label", undefined, "Sort");
  const sortSelect = el("select") as HTMLSelectElement;
  sortSelect.append(
    Object.assign(el("option", undefined, "Default"), { value: "" }),
    Object.assign(el("option", undefined, "Price: low to high"), { value: "price_asc" }),
    Object.assign(el("option", undefined, "Price: high to low"), { value: "price_desc" })
  );
  sortLabel.append(sortSelect);
  sortField.append(sortLabel);

  const submit = Object.assign(el("button", "finder-submit", "Search"), { type: "submit" });

  form.append(whereField, whoField, priceField, sortField, submit);
  finderContent.append(form);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const query: PropertyQuery = {};
    const location = whereInput.value.trim();
    if (location) {
      query.location = location;
    }
    const guests = Number(whoInput.value);
    if (whoInput.value !== "" && guests > 0) {
      query.guests = guests;
    }
    const maxPrice = Number(priceInput.value);
    if (priceInput.value !== "" && maxPrice > 0) {
      query.max_price = maxPrice;
    }
    if (sortSelect.value === "price_asc" || sortSelect.value === "price_desc") {
      query.sort = sortSelect.value;
    }
    onSearch(query);
    closeFinder();
  });
}

// --- Navigation ----------------------------------------------------------------

function renderNav(): void {
  if (!nav || !userNav) {
    return;
  }
  nav.textContent = "";
  userNav.textContent = "";

  // Pill navigation: Main, Stays, Finder
  const mainLink = el("a", "pill-link", "Main") as HTMLAnchorElement;
  mainLink.href = "#/properties";
  const staysLink = el("a", "pill-link", "Stays") as HTMLAnchorElement;
  staysLink.href = "#/properties";
  const finderButton = Object.assign(el("button", "pill-link pill-finder", "Finder"), {
    type: "button",
    onclick: toggleFinder,
  });
  nav.append(mainLink, staysLink, finderButton);

  // User links: different for logged in vs logged out
  const session = getSession();
  if (session) {
    const createLink = el("a", "user-link", "Create property") as HTMLAnchorElement;
    createLink.href = "#/properties/new";
    const bookingsLink = el("a", "user-link", "My bookings") as HTMLAnchorElement;
    bookingsLink.href = "#/bookings";
    userNav.append(
      createLink,
      bookingsLink,
      el("span", "nav-user", session.user.email),
      Object.assign(el("button", "user-link", "Log out"), {
        type: "button",
        onclick: () => void handleLogout(),
      })
    );
  } else {
    const loginLink = el("a", "user-link", "Log in") as HTMLAnchorElement;
    loginLink.href = "#/login";
    const registerLink = el("a", "user-link", "Register") as HTMLAnchorElement;
    registerLink.href = "#/register";
    userNav.append(loginLink, registerLink);
  }
}

function renderAuth(mode: "login" | "register", notice?: string): void {
  if (!app) {
    return;
  }
  app.textContent = "";

  const isLogin = mode === "login";
  const container = el("div", "form-container");
  const title = el("h2", undefined, isLogin ? "Log in" : "Create an account");
  const form = el("form") as HTMLFormElement;
  const messages = el("div", "messages");

  if (notice) {
    showMessage(messages, notice, "info");
  }

  const emailField = el("div", "form-field");
  const emailLabel = el("label", undefined, "Email");
  const emailInput = Object.assign(el("input"), {
    type: "email",
    name: "email",
    required: true,
    autocomplete: "email",
  });
  emailLabel.append(emailInput);
  emailField.append(emailLabel);

  const passwordField = el("div", "form-field");
  const passwordLabel = el("label", undefined, "Password");
  const passwordInput = Object.assign(el("input"), {
    type: "password",
    name: "password",
    required: true,
    minLength: isLogin ? 1 : 8,
    autocomplete: isLogin ? "current-password" : "new-password",
  });
  passwordLabel.append(passwordInput);
  passwordField.append(passwordLabel);

  const submit = Object.assign(el("button", "btn btn-primary", isLogin ? "Log in" : "Register"), {
    type: "submit",
  });
  submit.dataset.label = isLogin ? "Log in" : "Register";

  const switchLink = el("a", "btn btn-secondary", isLogin ? "Need an account? Register" : "Already have an account? Log in") as HTMLAnchorElement;
  switchLink.href = isLogin ? "#/register" : "#/login";

  form.append(emailField, passwordField, submit, messages, switchLink);
  container.append(title, form);
  app.append(container);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleAuthSubmit(form, emailInput.value, passwordInput.value, messages, isLogin);
  });
}

async function handleAuthSubmit(
  form: HTMLFormElement,
  email: string,
  password: string,
  messages: HTMLElement,
  isLogin: boolean
): Promise<void> {
  setBusy(form, true);
  messages.textContent = "";

  try {
    if (isLogin) {
      await login(email, password);
      renderNav();
      // Navigate to the list after login.
      window.location.hash = "#/properties";
    } else {
      const result = await register(email, password);
      if (result.email_confirmation_required) {
        showMessage(
          messages,
          "Account created! Check your email and click the confirmation link before logging in.",
          "info"
        );
        form.reset();
      } else {
        showMessage(messages, "Account created! You can now log in.", "info");
      }
    }
  } catch (error) {
    if (error instanceof ApiError) {
      // 403 from the backend means the email is not confirmed yet.
      showMessage(messages, error.message, "error");
    } else {
      showMessage(messages, "Something went wrong. Please try again.", "error");
    }
  } finally {
    setBusy(form, false);
  }
}

async function handleLogout(): Promise<void> {
  await logout();
  renderNav();
  // Navigate to the list after logout.
  window.location.hash = "#/properties";
}

// --- Startup -----------------------------------------------------------------

// Renders the view matching the current hash.
function route(): void {
  if (!app) {
    return;
  }
  const current = parseHash(window.location.hash);
  if (current.name === "list") {
    renderPropertyList(app);
  } else if (current.name === "detail") {
    renderPropertyDetail(app, current.id);
  } else if (current.name === "new") {
    // Creating a property requires login; send logged-out users to the login view.
    if (!getSession()) {
      window.location.hash = "#/login";
    } else {
      renderPropertyCreate(app);
    }
  } else if (current.name === "edit") {
    if (!getSession()) {
      window.location.hash = "#/login";
    } else {
      renderPropertyEdit(app, current.id);
    }
  } else if (current.name === "login") {
    renderAuth("login");
  } else if (current.name === "register") {
    renderAuth("register");
  } else if (current.name === "bookings") {
    if (!getSession()) {
      window.location.hash = "#/login";
    } else {
      renderBookingList(app);
    }
  } else if (current.name === "booking-edit") {
    if (!getSession()) {
      window.location.hash = "#/login";
    } else {
      renderBookingEdit(app, current.id);
    }
  } else {
    renderNotFound(app);
  }
}

async function init(): Promise<void> {
  loadSession();
  renderNav();
  startRouter(route);

  // Wire up the finder toggle button.
  if (finderToggle) {
    finderToggle.addEventListener("click", toggleFinder);
  }

  // Render the finder panel with the search callback.
  renderFinderPanel(searchProperties);

  // If we have a session, verify it is still valid (and refresh if needed).
  if (getSession()) {
    try {
      await apiFetch<MeResponse>("/auth/me");
    } catch {
      // apiFetch already cleared the session if the refresh failed.
      renderNav();
    }
  }
}

void init();
