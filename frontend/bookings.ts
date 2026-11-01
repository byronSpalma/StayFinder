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
    container.append(el("h2", undefined, "My bookings"));

    if (bookings.length === 0) {
      const link = el("a", "button-link", "Browse properties") as HTMLAnchorElement;
      link.href = "#/properties";
      container.append(
        el("p", "state", "You have no bookings yet."),
        link
      );
      return;
    }

    const list = el("div", "booking-list");
    for (const booking of bookings) {
      list.append(buildBookingCard(booking, propertyById.get(booking.property_id), container));
    }
    container.append(list);
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
  const card = el("div", "booking-card");

  const title = property ? property.title : `Unknown property (${booking.property_id})`;
  const nights = nightsBetween(booking.check_in, booking.check_out);
  const total = nights !== null && property ? nights * property.price_per_night : null;

  const statusText = booking.status === "cancelled" ? "Cancelled" : booking.status;
  const statusClass = `booking-status ${booking.status}`;

  card.append(
    el("h3", undefined, title),
    el("p", undefined, `Check-in: ${booking.check_in} · Check-out: ${booking.check_out}`),
    el("p", undefined, `${nights !== null ? `${nights} night${nights === 1 ? "" : "s"}` : "–"} · ${booking.guests} guest${booking.guests === 1 ? "" : "s"}`),
    el("p", undefined, total !== null ? `Total: ${total} kr` : ""),
    el("span", statusClass, statusText)
  );

  const actions = el("div", "property-actions");

  const editLink = el("a", "btn btn-secondary", "Edit") as HTMLAnchorElement;
  editLink.href = `#/bookings/${encodeURIComponent(booking.booking_id)}/edit`;
  actions.append(editLink);

  if (booking.status !== "cancelled") {
    const cancelButton = Object.assign(el("button", "btn btn-danger", "Cancel booking"), {
      type: "button",
      onclick: () => void handleCancel(booking, listContainer),
    });
    actions.append(cancelButton);
  }

  const deleteButton = Object.assign(el("button", "btn btn-danger", "Delete"), {
    type: "button",
    onclick: () => void handleDelete(booking, listContainer),
  });
  actions.append(deleteButton);

  card.append(actions);
  return card;
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
    container.append(el("h2", undefined, `Edit booking ${booking.booking_id}`));

    const form = el("form", "auth-form") as HTMLFormElement;
    const messages = el("div", "messages");
    const summary = el("p", "booking-summary");

    const checkInInput = dateField(form, "Check-in", booking.check_in);
    const checkOutInput = dateField(form, "Check-out", booking.check_out);
    const guestsInput = numberField(form, "Guests", String(booking.guests), property.max_guests);
    const nameInput = textField(form, "Your name", booking.guest_name);
    const emailInput = textField(form, "Your email", booking.guest_email);
    emailInput.type = "email";

    const submit = Object.assign(el("button", undefined, "Save changes"), { type: "submit" });
    submit.dataset.label = "Save changes";

    const cancelLink = el("a", "nav-link", "Cancel") as HTMLAnchorElement;
    cancelLink.href = "#/bookings";

    form.append(submit, cancelLink, messages, summary);
    container.append(form);

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

function dateField(form: HTMLFormElement, label: string, value: string): HTMLInputElement {
  const labelElement = el("label", undefined, label);
  const input = Object.assign(el("input"), { type: "date", required: true, value });
  labelElement.append(input);
  form.append(labelElement);
  return input;
}

function numberField(
  form: HTMLFormElement,
  label: string,
  value: string,
  max: number
): HTMLInputElement {
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
  form.append(labelElement);
  return input;
}

function textField(form: HTMLFormElement, label: string, value: string): HTMLInputElement {
  const labelElement = el("label", undefined, label);
  const input = Object.assign(el("input"), { type: "text", required: true, value });
  labelElement.append(input);
  form.append(labelElement);
  return input;
}

function showMessage(container: HTMLElement, message: string, kind: "error" | "info"): void {
  container.textContent = "";
  container.append(el("p", `message ${kind}`, message));
}
