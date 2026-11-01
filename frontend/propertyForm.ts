// The property form, shared by "create" (#/properties/new) and "edit" (#/properties/<id>/edit).
// Frontend validation gives quick feedback, but backend errors are always shown too.

import { apiFetch, ApiError } from "./api.js";
import type { NewProperty, Property } from "./types.js";

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

interface PropertyFormOptions {
  // The values to prefill the form with (empty for "create").
  initial?: Property;
  onSaved: (property: Property) => void;
  onCancel: () => void;
}

// Builds the form. When `initial` is given the form edits that property,
// otherwise it creates a new one.
export function renderPropertyForm(
  container: HTMLElement,
  options: PropertyFormOptions
): void {
  const { initial, onSaved, onCancel } = options;
  const isEdit = initial !== undefined;

  container.textContent = "";

  const formContainer = el("div", "form-container wide");
  formContainer.append(el("h2", undefined, isEdit ? "Edit property" : "Create a property"));

  const form = el("form") as HTMLFormElement;
  const messages = el("div", "messages");

  const titleInput = field(form, "Title", "text", initial?.title ?? "");
  const locationInput = field(form, "Location", "text", initial?.location ?? "");
  const descriptionInput = textArea(form, "Description", initial?.description ?? "");
  const priceInput = field(form, "Price per night", "number", initial ? String(initial.price_per_night) : "");
  priceInput.min = "1";
  const guestsInput = field(form, "Max guests", "number", initial ? String(initial.max_guests) : "");
  guestsInput.min = "1";
  guestsInput.step = "1";

  const submit = Object.assign(
    el("button", "btn btn-primary", isEdit ? "Save changes" : "Create property"),
    { type: "submit" }
  );
  submit.dataset.label = isEdit ? "Save changes" : "Create property";

  const cancel = Object.assign(el("button", "btn btn-secondary", "Cancel"), {
    type: "button",
    onclick: onCancel,
  });

  form.append(messages, submit, cancel);
  formContainer.append(form);
  container.append(formContainer);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleSubmit();
  });

  async function handleSubmit(): Promise<void> {
    messages.textContent = "";

    // Quick frontend validation for instant feedback. The backend validates again;
    // its errors are shown below, so we never rely on this alone.
    const problems: string[] = [];
    if (titleInput.value.trim() === "") problems.push("Title is required.");
    if (locationInput.value.trim() === "") problems.push("Location is required.");
    if (descriptionInput.value.trim() === "") problems.push("Description is required.");
    const price = Number(priceInput.value);
    if (priceInput.value === "" || !Number.isFinite(price) || price <= 0) {
      problems.push("Price per night must be a positive number.");
    }
    const guests = Number(guestsInput.value);
    if (guestsInput.value === "" || !Number.isInteger(guests) || guests <= 0) {
      problems.push("Max guests must be a positive whole number.");
    }
    if (problems.length > 0) {
      for (const problem of problems) {
        messages.append(el("p", "message error", problem));
      }
      return;
    }

    const body: NewProperty = {
      title: titleInput.value.trim(),
      description: descriptionInput.value.trim(),
      location: locationInput.value.trim(),
      price_per_night: price,
      max_guests: guests,
    };

    submit.disabled = true;
    submit.textContent = "Saving…";

    try {
      const saved = isEdit
        ? await apiFetch<Property>(`/properties/${encodeURIComponent(initial.property_id)}`, {
            method: "PUT",
            body,
          })
        : await apiFetch<Property>("/properties", { method: "POST", body });
      onSaved(saved);
    } catch (error) {
      if (error instanceof ApiError) {
        showMessage(messages, error.message, "error");
      } else {
        showMessage(messages, "Something went wrong. Please try again.", "error");
      }
      submit.disabled = false;
      submit.textContent = submit.dataset.label ?? "Save";
    }
  }
}

function field(
  form: HTMLFormElement,
  label: string,
  type: string,
  value: string
): HTMLInputElement {
  const fieldContainer = el("div", "form-field");
  const labelElement = el("label", undefined, label);
  const input = Object.assign(el("input"), { type, value, required: true });
  labelElement.append(input);
  fieldContainer.append(labelElement);
  form.append(fieldContainer);
  return input;
}

function textArea(form: HTMLFormElement, label: string, value: string): HTMLTextAreaElement {
  const fieldContainer = el("div", "form-field");
  const labelElement = el("label", undefined, label);
  const textarea = el("textarea") as HTMLTextAreaElement;
  textarea.value = value;
  textarea.required = true;
  textarea.rows = 4;
  labelElement.append(textarea);
  fieldContainer.append(labelElement);
  form.append(fieldContainer);
  return textarea;
}

function showMessage(container: HTMLElement, message: string, kind: "error" | "info"): void {
  container.textContent = "";
  container.append(el("p", `message ${kind}`, message));
}
