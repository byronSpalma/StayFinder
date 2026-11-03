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

  const card = el("div", "booking-card-panel");

  // Price header
  const priceHeader = el("div", "booking-price-header");
  priceHeader.append(
    el("span", "booking-price", `${property.price_per_night} kr`),
    el("span", "booking-price-unit", "/ night")
  );
  card.append(priceHeader);

  // Logged-out users get a prompt instead of the form.
  if (!session) {
    card.append(
      el("p", "state", "Log in to book your stay"),
      Object.assign(el("a", "btn btn-primary", "Log in to book") as HTMLAnchorElement, {
        href: "#/login",
      })
    );
    container.append(card);
    return;
  }

  const form = el("form") as HTMLFormElement;
  const messages = el("div", "messages");

  // Check-in and check-out side by side.
  const dateRow = el("div", "form-row");
  const checkInInput = dateField(dateRow, "Check-in", todayString());
  const checkOutInput = dateField(dateRow, "Check-out", todayString());
  form.append(dateRow);

  // Guests stepper.
  const guestsField = el("div", "form-field");
  const guestsLabel = el("label", undefined, "Guests");
  const stepper = el("div", "guests-stepper");
  const decreaseButton = Object.assign(el("button", "stepper-btn", "−"), {
    type: "button",
    "aria-label": "Decrease guests",
  });
  const guestsInput = Object.assign(el("input"), {
    type: "number",
    required: true,
    min: "1",
    max: String(property.max_guests),
    step: "1",
    value: "1",
  });
  const increaseButton = Object.assign(el("button", "stepper-btn", "+"), {
    type: "button",
    "aria-label": "Increase guests",
  });
  stepper.append(decreaseButton, guestsInput, increaseButton);
  guestsLabel.append(stepper);
  guestsField.append(guestsLabel);
  form.append(guestsField);

  // Name and email.
  const nameInput = textField(form, "Your name", "");
  const emailInput = textField(form, "Your email", session.user.email);
  emailInput.type = "email";

  // Price summary (only shown when dates are valid).
  const summary = el("div", "booking-summary-panel");
  summary.setAttribute("role", "status");
  summary.setAttribute("aria-live", "polite");
  const summaryRow = el("div", "booking-summary-row");
  const summaryLabel = el("span", "booking-summary-label");
  const summaryValue = el("span", "booking-summary-value");
  summaryRow.append(summaryLabel, summaryValue);
  const totalRow = el("div", "booking-total-row");
  const totalLabel = el("span", "booking-total-label", "Total");
  const totalValue = el("span", "booking-total-value");
  totalRow.append(totalLabel, totalValue);
  summary.append(summaryRow, totalRow);
  summary.hidden = true;

  // Submit button.
  const submit = Object.assign(el("button", "btn btn-primary", "Request to book"), { type: "submit" });
  submit.dataset.label = "Request to book";

  form.append(messages, summary, submit);
  card.append(form);
  container.append(card);

  // Update the price preview whenever the dates change.
  const updateSummary = () => {
    const nights = nightsBetween(checkInInput.value, checkOutInput.value);
    if (nights === null) {
      summary.hidden = true;
      return;
    }
    const total = nights * property.price_per_night;
    summaryLabel.textContent = `${property.price_per_night} kr × ${nights} night${nights === 1 ? "" : "s"}`;
    summaryValue.textContent = `${total} kr`;
    totalValue.textContent = `${total} kr`;
    summary.hidden = false;
  };
  checkInInput.addEventListener("change", updateSummary);
  checkOutInput.addEventListener("change", updateSummary);

  // Guests stepper buttons.
  const updateStepperButtons = () => {
    const value = Number(guestsInput.value);
    decreaseButton.disabled = value <= 1;
    increaseButton.disabled = value >= property.max_guests;
  };
  decreaseButton.addEventListener("click", () => {
    guestsInput.stepDown();
    guestsInput.dispatchEvent(new Event("input", { bubbles: true }));
    updateStepperButtons();
  });
  increaseButton.addEventListener("click", () => {
    guestsInput.stepUp();
    guestsInput.dispatchEvent(new Event("input", { bubbles: true }));
    updateStepperButtons();
  });
  guestsInput.addEventListener("input", updateStepperButtons);
  updateStepperButtons();

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
      submit.textContent = submit.dataset.label ?? "Request to book";
    }
  }
}

function dateField(container: HTMLElement, label: string, min: string): HTMLInputElement {
  const fieldContainer = el("div", "form-field");
  const labelElement = el("label", undefined, label);
  const input = Object.assign(el("input"), { type: "date", required: true, min });
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
