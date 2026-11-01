// "My bookings": list, edit and cancel the logged-in user's bookings.
// The backend (RLS) only returns the user's own bookings.

import { apiFetch, ApiError } from "./api.js";
import { nightsBetween } from "./bookingForm.js";
import type { Booking, Property } from "./types.js";

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

export function renderBookingList(container: HTMLElement): void {
  container.textContent = "";
  showLoading(container, "your bookings");

  void loadBookings(container);
}

async function loadBookings(container: HTMLElement): Promise<void> {
  try {
    // Fetch bookings and properties in parallel; properties are looked up by id.
    const [bookings, properties] = await Promise.all([
      apiFetch<Booking[]>("/bookings"),
      apiFetch<Property[]>("/properties", { auth: false }),
    ]);

    const propertyById = new Map(properties.map((p) => [p.property_id, p]));

    container.textContent = "";

    const page = el("div", "page-container");

    // Page header
    const header = el("div", "page-header");
    header.append(
      el("h1", "page-title", "My bookings"),
      el("p", "page-subtitle", `Your upcoming and past stays · ${bookings.length} booking${bookings.length === 1 ? "" : "s"}`)
    );
    page.append(header);

    if (bookings.length === 0) {
      const emptyCard = el("div", "empty-state");
      const link = el("a", "btn btn-primary", "Browse properties") as HTMLAnchorElement;
      link.href = "#/properties";
      emptyCard.append(
        el("p", "state", "You have no bookings yet. Find your next stay!"),
        link
      );
      page.append(emptyCard);
      container.append(page);
      return;
    }

    const list = el("div", "booking-list");
    for (const booking of bookings) {
      list.append(buildBookingCard(booking, propertyById.get(booking.property_id), container));
    }
    page.append(list);
    container.append(page);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "Could not load your bookings.";
    showError(container, message, () => void loadBookings(container));
  }
}

function buildBookingCard(
  booking: Booking,
  property: Property | undefined,
  listContainer: HTMLElement
): HTMLElement {
  const isCancelled = booking.status === "cancelled";
  const card = el("div", isCancelled ? "booking-card cancelled" : "booking-card");

  const nights = nightsBetween(booking.check_in, booking.check_out);
  const total = nights !== null && property ? nights * property.price_per_night : null;

  // Top row: location (left) and status pill (right)
  const topRow = el("div", "booking-card-top");
  if (property) {
    topRow.append(el("span", "booking-card-location", property.location));
  }
  const statusPill = el("span", `booking-status ${booking.status}`);
  const statusIcon = booking.status === "confirmed" ? "✓ " : booking.status === "cancelled" ? "✕ " : "• ";
  statusPill.textContent = statusIcon + booking.status.charAt(0).toUpperCase() + booking.status.slice(1);
  topRow.append(statusPill);
  card.append(topRow);

  // Title: link to the property detail page
  const title = property ? property.title : `Unknown property (${booking.property_id})`;
  if (property) {
    const titleLink = el("a", "booking-card-title", title) as HTMLAnchorElement;
    titleLink.href = `#/properties/${encodeURIComponent(property.property_id)}`;
    card.append(titleLink);
  } else {
    card.append(el("h3", "booking-card-title", title));
  }

  // Details grid: check-in, check-out, nights, guests
  const details = el("div", "booking-card-details");
  details.append(
    detailItem("Check-in", booking.check_in),
    detailItem("Check-out", booking.check_out),
    detailItem("Nights", nights !== null ? String(nights) : "–"),
    detailItem("Guests", String(booking.guests))
  );
  card.append(details);

  // Total
  if (total !== null) {
    const totalRow = el("div", "booking-card-total");
    totalRow.append(
      el("span", "booking-card-total-label", "Total"),
      el("span", "booking-card-total-value", `${total} kr`)
    );
    card.append(totalRow);
  }

  // Actions
  const actions = el("div", "booking-card-actions");

  const editLink = el("a", "btn btn-outline", "Edit") as HTMLAnchorElement;
  editLink.href = `#/bookings/${encodeURIComponent(booking.booking_id)}/edit`;
  actions.append(editLink);

  if (!isCancelled) {
    const cancelButton = Object.assign(el("button", "btn btn-outline", "Cancel booking"), {
      type: "button",
      onclick: () => void handleCancel(booking, listContainer),
    });
    actions.append(cancelButton);
  }

  const deleteButton = Object.assign(el("button", "btn btn-delete", "Delete"), {
    type: "button",
    onclick: () => void handleDelete(booking, listContainer),
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

async function handleCancel(booking: Booking, listContainer: HTMLElement): Promise<void> {
  if (!window.confirm(`Cancel booking ${booking.booking_id}?`)) {
    return;
  }
  try {
    await apiFetch<Booking>(`/bookings/${encodeURIComponent(booking.booking_id)}`, {
      method: "PATCH",
      body: { status: "cancelled" },
    });
    // Reload the list so the cancelled booking shows its new status.
    void loadBookings(listContainer);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "Could not cancel the booking.";
    showError(listContainer, message, () => void loadBookings(listContainer));
  }
}

async function handleDelete(booking: Booking, listContainer: HTMLElement): Promise<void> {
  if (!window.confirm(`Delete booking ${booking.booking_id}? This cannot be undone.`)) {
    return;
  }
  try {
    await apiFetch<{ message: string; booking: Booking }>(
      `/bookings/${encodeURIComponent(booking.booking_id)}`,
      { method: "DELETE" }
    );
    // Reload the list so the deleted booking disappears.
    void loadBookings(listContainer);
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "Could not delete the booking.";
    showError(listContainer, message, () => void loadBookings(listContainer));
  }
}

// --- Edit view -----------------------------------------------------------------

export function renderBookingEdit(container: HTMLElement, id: string): void {
  container.textContent = "";
  showLoading(container, "booking");

  void loadBookingForEdit(container, id);
}

async function loadBookingForEdit(container: HTMLElement, id: string): Promise<void> {
  try {
    const booking = await apiFetch<Booking>(`/bookings/${encodeURIComponent(id)}`);
    const property = await apiFetch<Property>(`/properties/${encodeURIComponent(booking.property_id)}`, {
      auth: false,
    });

    container.textContent = "";

    const page = el("div", "page-container");
    const formContainer = el("div", "form-container wide");

    formContainer.append(el("h2", undefined, "Edit booking"));
    formContainer.append(el("p", "page-subtitle", property.title));

    const form = el("form") as HTMLFormElement;
    const messages = el("div", "messages");
    const summary = el("p", "booking-summary");

    // Check-in and check-out side by side on wide screens.
    const dateRow = el("div", "form-row");
    const checkInInput = dateField(dateRow, "Check-in", booking.check_in);
    const checkOutInput = dateField(dateRow, "Check-out", booking.check_out);
    form.append(dateRow);

    const guestsInput = numberField(form, "Guests", String(booking.guests), property.max_guests);
    const nameInput = textField(form, "Your name", booking.guest_name);
    const emailInput = textField(form, "Your email", booking.guest_email);
    emailInput.type = "email";

    const submit = Object.assign(el("button", "btn btn-primary", "Save changes"), { type: "submit" });
    submit.dataset.label = "Save changes";

    const cancelLink = el("a", "btn btn-secondary", "Cancel") as HTMLAnchorElement;
    cancelLink.href = "#/bookings";

    form.append(messages, submit, cancelLink, summary);
    formContainer.append(form);
    page.append(formContainer);
    container.append(page);

    const updateSummary = () => {
      const nights = nightsBetween(checkInInput.value, checkOutInput.value);
      if (nights === null) {
        summary.textContent = "";
        return;
      }
      const total = nights * property.price_per_night;
      summary.textContent = `${nights} night${nights === 1 ? "" : "s"} · ${total} kr total`;
    };
    checkInInput.addEventListener("change", updateSummary);
    checkOutInput.addEventListener("change", updateSummary);
    updateSummary();

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void handleSubmit();
    });

    async function handleSubmit(): Promise<void> {
      messages.textContent = "";

      const problems: string[] = [];
      if (nameInput.value.trim() === "") problems.push("Your name is required.");
      if (emailInput.value.trim() === "") problems.push("Your email is required.");
      const guests = Number(guestsInput.value);
      if (guestsInput.value === "" || !Number.isInteger(guests) || guests <= 0) {
        problems.push("Guests must be a positive whole number.");
      }
      if (guests > property.max_guests) {
        problems.push(`This property allows at most ${property.max_guests} guests.`);
      }
      const nights = nightsBetween(checkInInput.value, checkOutInput.value);
      if (nights === null) {
        problems.push("Check-out must be after check-in.");
      }
      if (checkInInput.value < new Date().toISOString().slice(0, 10)) {
        problems.push("Check-in cannot be in the past.");
      }
      if (problems.length > 0) {
        for (const problem of problems) {
          messages.append(el("p", "message error", problem));
        }
        return;
      }

      const body = {
        property_id: booking.property_id,
        guest_name: nameInput.value.trim(),
        guest_email: emailInput.value.trim(),
        check_in: checkInInput.value,
        check_out: checkOutInput.value,
        guests,
      };

      submit.disabled = true;
      submit.textContent = "Saving…";

      try {
        await apiFetch<Booking>(`/bookings/${encodeURIComponent(booking.booking_id)}`, {
          method: "PUT",
          body,
        });
        window.location.hash = "#/bookings";
      } catch (error) {
        if (error instanceof ApiError) {
          showMessage(messages, error.message, "error");
        } else {
          showMessage(messages, "Something went wrong. Please try again.", "error");
        }
        submit.disabled = false;
        submit.textContent = submit.dataset.label ?? "Save changes";
      }
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      container.textContent = "";
      const backLink = el("a", "back-link", "← Back to my bookings") as HTMLAnchorElement;
      backLink.href = "#/bookings";
      container.append(
        el("h2", undefined, "Booking not found"),
        el("p", "state", "This booking does not exist or has been removed."),
        backLink
      );
      return;
    }
    const message = error instanceof ApiError ? error.message : "Could not load the booking.";
    showError(container, message, () => void loadBookingForEdit(container, id));
  }
}

// --- Form field helpers (same pattern as bookingForm.ts) ------------------------

function dateField(container: HTMLElement, label: string, value: string): HTMLInputElement {
  const fieldContainer = el("div", "form-field");
  const labelElement = el("label", undefined, label);
  const input = Object.assign(el("input"), { type: "date", required: true, value });
  labelElement.append(input);
  fieldContainer.append(labelElement);
  container.append(fieldContainer);
  return input;
}

function numberField(
  container: HTMLElement,
  label: string,
  value: string,
  max: number
): HTMLInputElement {
  const fieldContainer = el("div", "form-field");
  const labelElement = el("label", undefined, label);
  const input = Object.assign(el("input"), {
    type: "number",
    required: true,
    min: "1",
    max: String(max),
    step: "1",
    value,
  });
  labelElement.append(input);
  fieldContainer.append(labelElement);
  container.append(fieldContainer);
  return input;
}

function textField(container: HTMLElement, label: string, value: string): HTMLInputElement {
  const fieldContainer = el("div", "form-field");
  const labelElement = el("label", undefined, label);
  const input = Object.assign(el("input"), { type: "text", required: true, value });
  labelElement.append(input);
  fieldContainer.append(labelElement);
  container.append(fieldContainer);
  return input;
}

function showMessage(container: HTMLElement, message: string, kind: "error" | "info"): void {
  container.textContent = "";
  container.append(el("p", `message ${kind}`, message));
}
