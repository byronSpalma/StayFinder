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
import type { MeResponse, RegisterResponse, Session } from "./types.js";

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

function renderNav(): void {
  if (!nav) {
    return;
  }
  nav.textContent = "";

  const homeLink = el("a", "nav-link", "Properties") as HTMLAnchorElement;
  homeLink.href = "#/properties";

  const session = getSession();
  if (session) {
    const createLink = el("a", "nav-link", "Create property") as HTMLAnchorElement;
    createLink.href = "#/properties/new";
    const bookingsLink = el("a", "nav-link", "My bookings") as HTMLAnchorElement;
    bookingsLink.href = "#/bookings";
    nav.append(
      homeLink,
      createLink,
      bookingsLink,
      el("span", "nav-user", session.user.email),
      Object.assign(el("button", "nav-link", "Log out"), {
        type: "button",
        onclick: () => void handleLogout(),
      })
    );
  } else {
    nav.append(
      homeLink,
      Object.assign(el("button", "nav-link", "Log in"), {
        type: "button",
        onclick: () => renderAuth("login"),
      }),
      Object.assign(el("button", "nav-link", "Register"), {
        type: "button",
        onclick: () => renderAuth("register"),
      })
    );
  }
}

function renderAuth(mode: "login" | "register", notice?: string): void {
  if (!app) {
    return;
  }
  app.textContent = "";

  const isLogin = mode === "login";
  const title = el("h2", undefined, isLogin ? "Log in" : "Create an account");
  const form = el("form", "auth-form") as HTMLFormElement;
  const messages = el("div", "messages");

  if (notice) {
    showMessage(messages, notice, "info");
  }

  const emailLabel = el("label", undefined, "Email");
  const emailInput = Object.assign(el("input"), {
    type: "email",
    name: "email",
    required: true,
    autocomplete: "email",
  });
  emailLabel.append(emailInput);

  const passwordLabel = el("label", undefined, "Password");
  const passwordInput = Object.assign(el("input"), {
    type: "password",
    name: "password",
    required: true,
    minLength: isLogin ? 1 : 8,
    autocomplete: isLogin ? "current-password" : "new-password",
  });
  passwordLabel.append(passwordInput);

  const submit = Object.assign(el("button", undefined, isLogin ? "Log in" : "Register"), {
    type: "submit",
  });
  submit.dataset.label = isLogin ? "Log in" : "Register";

  const switchButton = Object.assign(
    el("button", "nav-link", isLogin ? "Need an account? Register" : "Already have an account? Log in"),
    { type: "button", onclick: () => renderAuth(isLogin ? "register" : "login") }
  );

  form.append(emailLabel, passwordLabel, submit, messages, switchButton);
  app.append(title, form);

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
      route();
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
  route();
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
      renderAuth("login", "You need to log in to create a property.");
    } else {
      renderPropertyCreate(app);
    }
  } else if (current.name === "edit") {
    if (!getSession()) {
      renderAuth("login", "You need to log in to edit a property.");
    } else {
      renderPropertyEdit(app, current.id);
    }
  } else if (current.name === "login") {
    renderAuth("login");
  } else if (current.name === "bookings") {
    if (!getSession()) {
      renderAuth("login", "You need to log in to see your bookings.");
    } else {
      renderBookingList(app);
    }
  } else if (current.name === "booking-edit") {
    if (!getSession()) {
      renderAuth("login", "You need to log in to edit a booking.");
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
