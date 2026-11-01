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

  const listContainer = el("div", "property-list");
  container.append(el("h2", undefined, "Properties"), listContainer);
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
  link.append(
    el("h3", undefined, property.title),
    el("p", "property-location", property.location),
    el("p", undefined, `${property.price_per_night} kr / night · up to ${property.max_guests} guests`)
  );
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

    const backLink = el("a", "back-link", "← Back to all properties") as HTMLAnchorElement;
    backLink.href = "#/properties";

    container.append(
      backLink,
      el("h2", undefined, property.title),
      el("p", "property-location", property.location),
      el("p", undefined, property.description),
      el("p", undefined, `Price: ${property.price_per_night} kr per night`),
      el("p", undefined, `Max guests: ${property.max_guests}`)
    );
    renderFlash(container);

    // Show Edit/Delete only when the logged-in user owns this property.
    // This is only the UI: the real protection is in the backend and RLS,
    // which reject changes to other users' properties even if these buttons
    // were shown by mistake.
    const session = getSession();
    if (session && session.user.id === property.owner_id) {
      const actions = el("div", "property-actions");

      const editLink = el("a", "button-link", "Edit") as HTMLAnchorElement;
      editLink.href = `#/properties/${encodeURIComponent(property.property_id)}/edit`;

      const deleteButton = Object.assign(el("button", "danger", "Delete"), {
        type: "button",
        onclick: () => void handleDelete(container, property),
      });

      actions.append(editLink, deleteButton);
      container.append(actions);
    }

    // Booking form (or a login prompt when logged out).
    const bookingContainer = el("div", "booking-section");
    container.append(bookingContainer);
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

  const backLink = el("a", "back-link", "← Back to all properties") as HTMLAnchorElement;
  backLink.href = "#/properties";

  const bookingsLink = el("a", "button-link", "My bookings") as HTMLAnchorElement;
  bookingsLink.href = "#/bookings";

  container.append(
    el("h2", undefined, "Booking confirmed!"),
    el("p", undefined, `Booking ID: ${booking.booking_id}`),
    el("p", undefined, `Property: ${property.title}`),
    el("p", undefined, `Check-in: ${booking.check_in}`),
    el("p", undefined, `Check-out: ${booking.check_out}`),
    el("p", undefined, `Guests: ${booking.guests}`),
    el("p", undefined, `Status: ${booking.status}`),
    el("p", undefined, total !== null ? `Total: ${total} kr (${nights} nights)` : ""),
    backLink,
    bookingsLink
  );
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
