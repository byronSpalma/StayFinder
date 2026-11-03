// "Your stays": the logged-in user's own properties, with create/edit/delete.
// The backend route GET /properties/mine is protected by requireAuth and RLS.

import { apiFetch, ApiError } from "./api.js";
import type { Property } from "./types.js";

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

function showLoading(container: HTMLElement, what: string): void {
  container.textContent = "";
  const wrapper = el("div", "page-container");
  wrapper.append(el("p", "state", `Loading ${what}…`));
  container.append(wrapper);
}

function showError(container: HTMLElement, message: string, retry: () => void): void {
  container.textContent = "";
  const wrapper = el("div", "page-container");
  const retryButton = Object.assign(el("button", "btn btn-primary", "Try again"), {
    type: "button",
    onclick: retry,
  });
  wrapper.append(el("p", "message error", message), retryButton);
  container.append(wrapper);
}

// --- List view -----------------------------------------------------------------

export function renderHostList(container: HTMLElement): void {
  container.textContent = "";
  showLoading(container, "your stays");

  void loadStays(container);
}

async function loadStays(container: HTMLElement): Promise<void> {
  try {
    const properties = await apiFetch<Property[]>("/properties/mine");

    container.textContent = "";

    const page = el("div", "page-container");

    // Page header
    const header = el("div", "page-header");
    header.append(
      el("h1", "page-title", "Your stays"),
      el("p", "page-subtitle", `Manage your listed properties · ${properties.length} ${properties.length === 1 ? "stay" : "stays"}`)
    );

    const createLink = el("a", "btn btn-primary", "Create property") as HTMLAnchorElement;
    createLink.href = "#/properties/new";
    header.append(createLink);

    page.append(header);

    if (properties.length === 0) {
      const emptyCard = el("div", "empty-state");
      const link = el("a", "btn btn-primary", "Create property") as HTMLAnchorElement;
      link.href = "#/properties/new";
      emptyCard.append(
        el("p", "state", "You haven't listed any stays yet."),
        link
      );
      page.append(emptyCard);
      container.append(page);
      return;
    }

    const list = el("div", "property-list");
    for (const property of properties) {
      list.append(buildStayCard(property, container));
    }
    page.append(list);
    container.append(page);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "Could not load your stays.";
    showError(container, message, () => void loadStays(container));
  }
}

function buildStayCard(property: Property, listContainer: HTMLElement): HTMLElement {
  const card = el("div", "booking-card");

  // Background image (if any), with a dark gradient over it for readability.
  if (property.image_url) {
    const img = el("img", "booking-card-image") as HTMLImageElement;
    img.src = property.image_url;
    img.alt = "";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      img.remove();
    });
    card.append(img);
  }

  // Title: link to the property detail page
  const titleLink = el("a", "booking-card-title", property.title) as HTMLAnchorElement;
  titleLink.href = `#/properties/${encodeURIComponent(property.property_id)}`;
  card.append(titleLink);

  // Details
  const details = el("div", "booking-card-details");
  details.append(
    detailItem("Location", property.location),
    detailItem("Price", `${property.price_per_night} kr / night`),
    detailItem("Max guests", String(property.max_guests))
  );
  card.append(details);

  // Actions
  const actions = el("div", "booking-card-actions");

  const editLink = el("a", "btn btn-outline", "Edit") as HTMLAnchorElement;
  editLink.href = `#/properties/${encodeURIComponent(property.property_id)}/edit`;
  actions.append(editLink);

  const deleteButton = Object.assign(el("button", "btn btn-delete", "Delete"), {
    type: "button",
    onclick: () => void handleDelete(property, listContainer),
  });
  actions.append(deleteButton);

  card.append(actions);
  return card;
}

function detailItem(label: string, value: string): HTMLElement {
  const item = el("div", "booking-card-detail");
  item.append(
    el("span", "booking-card-detail-label", label),
    el("span", "booking-card-detail-value", value)
  );
  return item;
}

async function handleDelete(property: Property, listContainer: HTMLElement): Promise<void> {
  if (!window.confirm(`Delete "${property.title}"? This cannot be undone.`)) {
    return;
  }
  try {
    await apiFetch<{ message: string; property: Property }>(
      `/properties/${encodeURIComponent(property.property_id)}`,
      { method: "DELETE" }
    );
    // Reload the list so the deleted property disappears.
    void loadStays(listContainer);
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      showError(listContainer, "This property has bookings and cannot be deleted.", () =>
        void loadStays(listContainer)
      );
      return;
    }
    const message = error instanceof ApiError ? error.message : "Could not delete the property.";
    showError(listContainer, message, () => void loadStays(listContainer));
  }
}
