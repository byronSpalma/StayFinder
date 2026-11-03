// Property views: the list with filters, and the detail page.
// All data comes from the backend; filtering and sorting happen there.

import { apiFetch, ApiError } from "./api.js";
import { getSession } from "./session.js";
import { renderPropertyForm } from "./propertyForm.js";
import { renderBookingForm, nightsBetween } from "./bookingForm.js";
import type { Booking, DeletePropertyResponse, Property, PropertyQuery } from "./types.js";

// --- Small DOM helper (same pattern as main.ts) -------------------------------

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

// --- Shared view states --------------------------------------------------------

function showLoading(container: HTMLElement, what: string): void {
  container.textContent = "";
  container.append(el("p", "state", `Loading ${what}…`));
}

function showError(container: HTMLElement, message: string, retry: () => void): void {
  container.textContent = "";
  const retryButton = Object.assign(el("button", undefined, "Try again"), {
    type: "button",
    onclick: retry,
  });
  container.append(el("p", "message error", message), retryButton);
}

// --- API calls -----------------------------------------------------------------

// Builds the query string with URLSearchParams so values are encoded safely.
function fetchProperties(query: PropertyQuery): Promise<Property[]> {
  const params = new URLSearchParams();
  if (query.location) {
    params.set("location", query.location);
  }
  if (query.max_price !== undefined) {
    params.set("max_price", String(query.max_price));
  }
  if (query.guests !== undefined) {
    params.set("guests", String(query.guests));
  }
  if (query.sort) {
    params.set("sort", query.sort);
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return apiFetch<Property[]>(`/properties${suffix}`, { auth: false });
}

function fetchProperty(id: string): Promise<Property> {
  return apiFetch<Property>(`/properties/${encodeURIComponent(id)}`, { auth: false });
}

// --- List view -----------------------------------------------------------------

export function renderPropertyList(container: HTMLElement): void {
  container.textContent = "";

  // Hero section
  const hero = el("section", "hero");
  const heroTitle = el("h1", "hero-title");
  heroTitle.append(
    el("span", "hero-line", "Find somewhere"),
    el("span", "hero-line hero-line-slate", "worth staying.")
  );
  const heroText = el(
    "p",
    "hero-text",
    "Discover unique places to stay, from cozy studios to countryside cabins."
  );
  hero.append(heroTitle, heroText);

  const listContainer = el("div", "property-list");
  container.append(hero, listContainer);
  renderFlash(container);

  // The filter form lives in the finder panel (rendered by main.ts).
  // We just need to load the list; the panel calls us back with the query.
  void loadList(listContainer, {});
}

// Called by main.ts when the finder panel is submitted.
export function searchProperties(query: PropertyQuery): void {
  const listContainer = document.querySelector<HTMLElement>(".property-list");
  if (listContainer) {
    void loadList(listContainer, query);
  }
}

async function loadList(container: HTMLElement, query: PropertyQuery): Promise<void> {
  showLoading(container, "properties");
  try {
    const properties = await fetchProperties(query);
    container.textContent = "";
    if (properties.length === 0) {
      container.append(el("p", "state", "No properties found. Try changing your filters."));
      return;
    }
    for (const property of properties) {
      container.append(buildPropertyCard(property));
    }
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "Could not load properties.";
    showError(container, message, () => void loadList(container, query));
  }
}

function buildPropertyCard(property: Property): HTMLElement {
  const link = el("a", "property-card") as HTMLAnchorElement;
  link.href = `#/properties/${encodeURIComponent(property.property_id)}`;

  // Background image (if any), with a dark gradient over it for readability.
  if (property.image_url) {
    const img = el("img", "property-card-image") as HTMLImageElement;
    img.src = property.image_url;
    img.alt = "";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      img.remove();
    });
    link.append(img);
  }

  // Card content: location (small uppercase), title (display), price/guests (small)
  const content = el("div", "property-card-content");
  content.append(
    el("p", "property-card-location", property.location),
    el("h3", "property-card-title", property.title),
    el("p", "property-card-meta", `${property.price_per_night} kr / night · up to ${property.max_guests} guests`)
  );

  link.append(content);
  return link;
}

// --- Detail view ---------------------------------------------------------------

export function renderPropertyDetail(container: HTMLElement, id: string): void {
  container.textContent = "";
  showLoading(container, "property");

  void loadDetail(container, id);
}

async function loadDetail(container: HTMLElement, id: string): Promise<void> {
  try {
    const property = await fetchProperty(id);
    container.textContent = "";

    const detailPage = el("div", "detail-page");

    const backLink = el("a", "back-link", "← Back to all properties") as HTMLAnchorElement;
    backLink.href = "#/properties";
    detailPage.append(backLink);

    // Two-column layout: info on the left, booking card on the right (from 64rem).
    const layout = el("div", "detail-layout");

    // --- Info column (left) ---
    const info = el("div", "detail-info");

    // Large image with a location chip on top.
    const imageContainer = el("div", "detail-image-container");
    if (property.image_url) {
      const img = el("img", "detail-image") as HTMLImageElement;
      img.src = property.image_url;
      img.alt = `Photo of ${property.title}`;
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => {
        img.remove();
      });
      imageContainer.append(img);
    }
    const locationChip = el("span", "detail-image-chip", property.location);
    imageContainer.append(locationChip);
    info.append(imageContainer);

    // Location, title, description, guests chip.
    info.append(el("p", "detail-location-line", property.location));
    info.append(el("h1", "detail-title", property.title));
    info.append(el("p", "detail-description", property.description));
    info.append(el("span", "detail-guests-chip", `Up to ${property.max_guests} guests`));

    // Owner actions (Edit/Delete) below the info, not in the booking card.
    const session = getSession();
    if (session && session.user.id === property.owner_id) {
      const actions = el("div", "detail-actions");

      const editLink = el("a", "btn btn-outline", "Edit") as HTMLAnchorElement;
      editLink.href = `#/properties/${encodeURIComponent(property.property_id)}/edit`;

      const deleteButton = Object.assign(el("button", "btn btn-delete", "Delete"), {
        type: "button",
        onclick: () => void handleDelete(container, property),
      });

      actions.append(editLink, deleteButton);
      info.append(actions);
    }

    layout.append(info);

    // --- Booking column (right) ---
    const bookingContainer = el("div", "detail-booking");
    layout.append(bookingContainer);

    detailPage.append(layout);
    container.append(detailPage);
    renderFlash(container);

    renderBookingForm(bookingContainer, property, (booking) => {
      renderBookingConfirmation(container, property, booking);
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      container.textContent = "";
      const backLink = el("a", "back-link", "← Back to all properties") as HTMLAnchorElement;
      backLink.href = "#/properties";
      container.append(
        el("h2", undefined, "Property not found"),
        el("p", "state", "This property does not exist or has been removed."),
        backLink
      );
      return;
    }
    const message = error instanceof ApiError ? error.message : "Could not load the property.";
    showError(container, message, () => void loadDetail(container, id));
  }
}

// --- Create / edit / delete ----------------------------------------------------

// #/properties/new — only for logged-in users (the nav link is hidden otherwise).
export function renderPropertyCreate(container: HTMLElement): void {
  renderPropertyForm(container, {
    onSaved: (property) => {
      window.location.hash = `#/properties/${encodeURIComponent(property.property_id)}`;
      showFlash("Property created.");
    },
    onCancel: () => {
      window.location.hash = "#/properties";
    },
  });
}

// #/properties/<id>/edit — loads the property first, then shows the same form prefilled.
export function renderPropertyEdit(container: HTMLElement, id: string): void {
  container.textContent = "";
  showLoading(container, "property");

  void (async () => {
    try {
      const property = await fetchProperty(id);
      renderPropertyForm(container, {
        initial: property,
        onSaved: (saved) => {
          window.location.hash = `#/properties/${encodeURIComponent(saved.property_id)}`;
          showFlash("Property updated.");
        },
        onCancel: () => {
          window.location.hash = `#/properties/${encodeURIComponent(id)}`;
        },
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        container.textContent = "";
        const backLink = el("a", "back-link", "← Back to all properties") as HTMLAnchorElement;
        backLink.href = "#/properties";
        container.append(
          el("h2", undefined, "Property not found"),
          el("p", "state", "This property does not exist or has been removed."),
          backLink
        );
        return;
      }
      const message = error instanceof ApiError ? error.message : "Could not load the property.";
      showError(container, message, () => renderPropertyEdit(container, id));
    }
  })();
}

async function handleDelete(container: HTMLElement, property: Property): Promise<void> {
  if (!window.confirm(`Delete "${property.title}"? This cannot be undone.`)) {
    return;
  }

  try {
    await apiFetch<DeletePropertyResponse>(
      `/properties/${encodeURIComponent(property.property_id)}`,
      { method: "DELETE" }
    );
    window.location.hash = "#/properties";
    showFlash("Property deleted.");
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "Could not delete the property.";
    showError(container, message, () => void loadDetail(container, property.property_id));
  }
}

// A short-lived confirmation message shown after navigating to a new view.
let flashMessage: string | null = null;

function showFlash(message: string): void {
  flashMessage = message;
}

// Renders (and clears) the pending flash message, if any. Called by every view.
export function renderFlash(container: HTMLElement): void {
  if (flashMessage) {
    container.prepend(el("p", "message info", flashMessage));
    flashMessage = null;
  }
}

// --- Booking confirmation ------------------------------------------------------

// Shown on the detail page after a successful booking.
function renderBookingConfirmation(
  container: HTMLElement,
  property: Property,
  booking: Booking
): void {
  container.textContent = "";

  const nights = nightsBetween(booking.check_in, booking.check_out);
  const total = nights !== null ? nights * property.price_per_night : null;

  const page = el("div", "page-container");
  const panel = el("div", "confirmation-panel");

  // Decorative check circle
  const checkCircle = el("div", "confirmation-check");
  checkCircle.setAttribute("aria-hidden", "true");
  checkCircle.textContent = "✓";
  panel.append(checkCircle);

  // Heading (gets focus so screen readers announce the confirmation)
  const heading = el("h1", "confirmation-title", "Booking received");
  heading.tabIndex = -1;
  panel.append(heading);

  panel.append(
    el("p", "confirmation-subtitle", "We've saved your booking. You can review or change it under Bookings.")
  );

  // Summary grid
  const summary = el("div", "confirmation-summary");
  summary.append(
    confirmationItem("Property", property.title, true),
    confirmationItem("Check-in", booking.check_in),
    confirmationItem("Check-out", booking.check_out),
    confirmationItem("Guests", String(booking.guests)),
    confirmationItem("Nights", nights !== null ? String(nights) : "–"),
    confirmationItem("Booking ID", booking.booking_id)
  );

  // Status pill
  const statusItem = el("div", "confirmation-item");
  const statusLabel = el("span", "confirmation-label", "Status");
  const statusPill = el("span", `booking-status ${booking.status}`);
  const statusIcon = booking.status === "confirmed" ? "✓ " : booking.status === "cancelled" ? "✕ " : "• ";
  statusPill.textContent = statusIcon + booking.status.charAt(0).toUpperCase() + booking.status.slice(1);
  statusItem.append(statusLabel, statusPill);
  summary.append(statusItem);

  panel.append(summary);

  // Total
  if (total !== null) {
    const totalRow = el("div", "confirmation-total");
    totalRow.append(
      el("span", "confirmation-total-label", "Total"),
      el("span", "confirmation-total-value", `${total} kr`)
    );
    panel.append(totalRow);
  }

  // Actions
  const actions = el("div", "confirmation-actions");
  const bookingsLink = el("a", "btn btn-primary", "My bookings") as HTMLAnchorElement;
  bookingsLink.href = "#/bookings";
  const backLink = el("a", "btn btn-outline", "Back to all properties") as HTMLAnchorElement;
  backLink.href = "#/properties";
  actions.append(bookingsLink, backLink);
  panel.append(actions);

  page.append(panel);
  container.append(page);

  // Move focus to the heading so screen readers announce the confirmation.
  heading.focus();
}

function confirmationItem(label: string, value: string, fullWidth = false): HTMLElement {
  const item = el("div", fullWidth ? "confirmation-item full-width" : "confirmation-item");
  item.append(
    el("span", "confirmation-label", label),
    el("span", "confirmation-value", value)
  );
  return item;
}

// --- Not found -----------------------------------------------------------------
export function renderNotFound(container: HTMLElement): void {
  container.textContent = "";
  const homeLink = el("a", "back-link", "← Back to all properties") as HTMLAnchorElement;
  homeLink.href = "#/properties";
  container.append(
    el("h2", undefined, "Page not found"),
    el("p", "state", "The page you are looking for does not exist."),
    homeLink
  );
}
