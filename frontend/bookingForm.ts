// Booking form on the property detail page.
// Shows nights and total price as a preview while the user fills in the dates.

import { apiFetch, ApiError } from "./api.js";
import { getSession } from "./session.js";
import type { Booking, NewBooking, Property } from "./types.js";

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

// Parses "YYYY-MM-DD" as UTC so daylight saving and time zones never affect the count.
function parseDateUtc(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

// Whole days between two YYYY-MM-DD dates, or null when invalid.
export function nightsBetween(checkIn: string, checkOut: string): number | null {
  const start = parseDateUtc(checkIn);
  const end = parseDateUtc(checkOut);
  if (!start || !end) {
    return null;
  }
  const diff = end.getTime() - start.getTime();
  const nights = diff / (1000 * 60 * 60 * 24);
  return nights > 0 ? nights : null;
}

// Today's date as YYYY-MM-DD, for the date inputs' min attribute.
function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function renderBookingForm(
  container: HTMLElement,
  property: Property,
  onBooked: (booking: Booking) => void
): void {
  const session = getSession();

  // Logged-out users get a prompt instead of the form.
  if (!session) {
    const loginLink = el("a", "btn btn-primary", "Log in to book") as HTMLAnchorElement;
    loginLink.href = "#/login";
    container.append(
      el("h3", undefined, "Book this property"),
      el("p", "state", "You need to log in to make a booking."),
      loginLink
    );
    return;
  }

  container.append(el("h3", undefined, "Book this property"));

  const form = el("form") as HTMLFormElement;
  const messages = el("div", "messages");
  const summary = el("p", "booking-summary");

  const checkInInput = dateField(form, "Check-in", todayString());
  const checkOutInput = dateField(form, "Check-out", todayString());
  const guestsInput = numberField(form, "Guests", "1", property.max_guests);
  const nameInput = textField(form, "Your name", "");
  const emailInput = textField(form, "Your email", session.user.email);
  emailInput.type = "email";

  const submit = Object.assign(el("button", "btn btn-primary", "Book"), { type: "submit" });
  submit.dataset.label = "Book";

  form.append(messages, submit, summary);
  container.append(form);

  // Update the price preview whenever the dates change.
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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleSubmit();
  });

  async function handleSubmit(): Promise<void> {
    messages.textContent = "";

    // Quick frontend validation for instant feedback. The backend validates again.
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
    if (checkInInput.value < todayString()) {
      problems.push("Check-in cannot be in the past.");
    }
    if (problems.length > 0) {
      for (const problem of problems) {
        messages.append(el("p", "message error", problem));
      }
      return;
    }

    const body: NewBooking = {
      property_id: property.property_id,
      guest_name: nameInput.value.trim(),
      guest_email: emailInput.value.trim(),
      check_in: checkInInput.value,
      check_out: checkOutInput.value,
      guests,
    };

    submit.disabled = true;
    submit.textContent = "Booking…";

    try {
      const booking = await apiFetch<Booking>("/bookings", { method: "POST", body });
      onBooked(booking);
    } catch (error) {
      if (error instanceof ApiError) {
        showMessage(messages, error.message, "error");
      } else {
        showMessage(messages, "Something went wrong. Please try again.", "error");
      }
      submit.disabled = false;
      submit.textContent = submit.dataset.label ?? "Book";
    }
  }
}

function dateField(form: HTMLFormElement, label: string, min: string): HTMLInputElement {
  const fieldContainer = el("div", "form-field");
  const labelElement = el("label", undefined, label);
  const input = Object.assign(el("input"), { type: "date", required: true, min });
  labelElement.append(input);
  fieldContainer.append(labelElement);
  form.append(fieldContainer);
  return input;
}

function numberField(
  form: HTMLFormElement,
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
  form.append(fieldContainer);
  return input;
}

function textField(form: HTMLFormElement, label: string, value: string): HTMLInputElement {
  const fieldContainer = el("div", "form-field");
  const labelElement = el("label", undefined, label);
  const input = Object.assign(el("input"), { type: "text", required: true, value });
  labelElement.append(input);
  fieldContainer.append(labelElement);
  form.append(fieldContainer);
  return input;
}

function showMessage(container: HTMLElement, message: string, kind: "error" | "info"): void {
  container.textContent = "";
  container.append(el("p", `message ${kind}`, message));
}
