import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { supabase } from "../lib/supabaseClient.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthVariables } from "../types/auth.js";
import type { Booking } from "../types/booking.js";

const bookingStatusSchema = z.enum(["pending", "confirmed", "cancelled"]);

// A date on the form YYYY-MM-DD that actually exists (so not 2026-02-31).
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date on the form YYYY-MM-DD")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "must be a date that exists");

// Fields a client provides; booking_id, status and user_id are filled in by the server.
// user_id is deliberately not in the schema, so it is stripped if a client sends it.
const newBookingBodySchema = z.object({
  property_id: z.string().min(1, "property_id is required"),
  guest_name: z.string().min(1, "guest_name is required"),
  guests: z.number().int().positive("guests must be greater than 0"),
  guest_email: z.string().email("guest_email must be a valid email"),
  check_in: dateSchema,
  check_out: dateSchema,
  status: bookingStatusSchema.optional(),
});

// Same fields, but every field is optional (used for PATCH).
const patchBookingBodySchema = newBookingBodySchema.partial();

// Returns 400 with { errors: [...] } when the request body fails validation.
const bookingValidator = <T extends z.ZodTypeAny>(schema: T) =>
  zValidator("json", schema, (result, c) => {
    if (!result.success) {
      return c.json({ errors: result.error.issues }, 400);
    }
  });

// Today's date as YYYY-MM-DD, so it can be compared with the date strings.
const todayString = () => new Date().toISOString().slice(0, 10);

// Date rules that only need the booking itself. Used by POST, PUT and PATCH.
// Returns a readable message, or null when the dates are fine.
function validateBookingDates(booking: {
  check_in: string;
  check_out: string;
}): string | null {
  if (booking.check_out <= booking.check_in) {
    return "Check-out must be after check-in";
  }
  if (booking.check_in < todayString()) {
    return "Check-in cannot be in the past";
  }
  return null;
}

// Checks that need the database: the property must exist and fit the guests.
// Properties are readable by everyone, so the shared client is enough.
// Returns { status, message } for a response, or null when everything is fine.
async function validateBookingAgainstProperty(booking: {
  property_id: string;
  guests: number;
}): Promise<{ status: 400 | 404 | 500; message: string } | null> {
  const { data, error } = await supabase
    .from("properties")
    .select("max_guests")
    .eq("property_id", booking.property_id)
    .maybeSingle();

  if (error) {
    return { status: 500, message: error.message };
  }
  if (!data) {
    return { status: 404, message: `Property with id ${booking.property_id} not found` };
  }
  if (booking.guests > data.max_guests) {
    return {
      status: 400,
      message: `This property allows at most ${data.max_guests} guests`,
    };
  }
  return null;
}

export const bookings = new Hono<{ Variables: AuthVariables }>();

// Every booking route requires a logged-in user and uses the client carrying that user's JWT.
bookings.use(requireAuth);

bookings.get("/", async (c) => {
  const { data, error } = await c.get("db").from("bookings").select("*");
  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data as Booking[]);
});

bookings.get("/:id", async (c) => {
  const id = c.req.param("id");

  const { data, error } = await c.get("db")
    .from("bookings")
    .select("*")
    .eq("booking_id", id)
    .maybeSingle();

  if (error) {
    return c.json({ error: error.message }, 500);
  }
  if (!data) {
    return c.json({ error: `Booking with id ${id} not found` }, 404);
  }

  return c.json(data as Booking);
});

bookings.post("/", bookingValidator(newBookingBodySchema), async (c) => {
  const body = c.req.valid("json");

  const dateError = validateBookingDates(body);
  if (dateError) {
    return c.json({ errors: [{ path: ["check_out"], message: dateError }] }, 400);
  }
  const propertyError = await validateBookingAgainstProperty(body);
  if (propertyError) {
    return c.json({ error: propertyError.message }, propertyError.status);
  }

  const newBooking: Booking = {
    ...body,
    booking_id: `booking_${Math.floor(1000 + Math.random() * 9000)}`,
    status: body.status ?? "pending",
    // The owner always comes from the verified token, never from the request body.
    user_id: c.get("user").id,
  };

  const { data, error } = await c.get("db")
    .from("bookings")
    .insert(newBooking)
    .select()
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data as Booking, 201);
});

bookings.put("/:id", bookingValidator(newBookingBodySchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const dateError = validateBookingDates(body);
  if (dateError) {
    return c.json({ errors: [{ path: ["check_out"], message: dateError }] }, 400);
  }
  const propertyError = await validateBookingAgainstProperty(body);
  if (propertyError) {
    return c.json({ error: propertyError.message }, propertyError.status);
  }

  // The id always comes from the URL, never from the request body.
  // user_id is left out on purpose, so a PUT can never change who owns the booking.
  const updatedBooking: Omit<Booking, "user_id"> = {
    ...body,
    booking_id: id,
    status: body.status ?? "pending",
  };

  const { data, error } = await c.get("db")
    .from("bookings")
    .update(updatedBooking)
    .eq("booking_id", id)
    .select()
    .maybeSingle();

  if (error) {
    return c.json({ error: error.message }, 500);
  }
  if (!data) {
    return c.json({ error: `Booking with id ${id} not found` }, 404);
  }

  return c.json(data as Booking);
});

bookings.patch("/:id", bookingValidator(patchBookingBodySchema), async (c) => {
  const id = c.req.param("id");
  // user_id is excluded from the type: a PATCH can never change who owns the booking.
  const patchData: Partial<Omit<Booking, "user_id">> = c.req.valid("json");

  // A PATCH may only change one field, so fetch the booking and merge before validating.
  const { data: existing, error: fetchError } = await c.get("db")
    .from("bookings")
    .select("*")
    .eq("booking_id", id)
    .maybeSingle();

  if (fetchError) {
    return c.json({ error: fetchError.message }, 500);
  }
  if (!existing) {
    return c.json({ error: `Booking with id ${id} not found` }, 404);
  }

  const merged = { ...existing, ...patchData } as Booking;

  const dateError = validateBookingDates(merged);
  if (dateError) {
    return c.json({ errors: [{ path: ["check_out"], message: dateError }] }, 400);
  }
  const propertyError = await validateBookingAgainstProperty(merged);
  if (propertyError) {
    return c.json({ error: propertyError.message }, propertyError.status);
  }

  const { data, error } = await c.get("db")
    .from("bookings")
    .update(patchData)
    .eq("booking_id", id)
    .select()
    .maybeSingle();

  if (error) {
    return c.json({ error: error.message }, 500);
  }
  if (!data) {
    return c.json({ error: `Booking with id ${id} not found` }, 404);
  }

  return c.json(data as Booking);
});

bookings.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const { data, error } = await c.get("db")
    .from("bookings")
    .delete()
    .eq("booking_id", id)
    .select()
    .maybeSingle();

  if (error) {
    return c.json({ error: error.message }, 500);
  }
  if (!data) {
    return c.json({ error: `Booking with id ${id} not found` }, 404);
  }

  return c.json({ message: "Booking deleted", booking: data as Booking });
});
