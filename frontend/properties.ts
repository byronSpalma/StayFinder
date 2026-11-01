// Property views: the list with filters, and the detail page.
// All data comes from the backend; filtering and sorting happen there.

import { apiFetch, ApiError } from "./api.js";
import type { Property, PropertyQuery } from "./types.js";

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
  const form = buildFilterForm((query) => void loadList(listContainer, query));
  container.append(el("h2", undefined, "Properties"), form, listContainer);

  void loadList(listContainer, {});
}

function buildFilterForm(onSearch: (query: PropertyQuery) => void): HTMLFormElement {
  const form = el("form", "filter-form") as HTMLFormElement;

  const locationInput = Object.assign(el("input"), {
    type: "text",
    name: "location",
    placeholder: "Location",
  });

  const maxPriceInput = Object.assign(el("input"), {
    type: "number",
    name: "max_price",
    placeholder: "Max price",
    min: "1",
  });

  const guestsInput = Object.assign(el("input"), {
    type: "number",
    name: "guests",
    placeholder: "Guests",
    min: "1",
  });

  const sortSelect = el("select") as HTMLSelectElement;
  sortSelect.append(
    Object.assign(el("option", undefined, "Sort by price"), { value: "" }),
    Object.assign(el("option", undefined, "Price: low to high"), { value: "price_asc" }),
    Object.assign(el("option", undefined, "Price: high to low"), { value: "price_desc" })
  );

  const submit = Object.assign(el("button", undefined, "Search"), { type: "submit" });

  form.append(locationInput, maxPriceInput, guestsInput, sortSelect, submit);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const query: PropertyQuery = {};
    const location = locationInput.value.trim();
    if (location) {
      query.location = location;
    }
    const maxPrice = Number(maxPriceInput.value);
    if (maxPriceInput.value !== "" && maxPrice > 0) {
      query.max_price = maxPrice;
    }
    const guests = Number(guestsInput.value);
    if (guestsInput.value !== "" && guests > 0) {
      query.guests = guests;
    }
    if (sortSelect.value === "price_asc" || sortSelect.value === "price_desc") {
      query.sort = sortSelect.value;
    }
    onSearch(query);
  });

  return form;
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
      el("p", undefined, `Max guests: ${property.max_guests}`),
      // Placeholder: the booking form is added in the next step.
      el("p", "state", "Booking form coming soon.")
    );
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
