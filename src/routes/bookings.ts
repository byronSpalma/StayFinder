import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import type { AuthVariables } from "../types/auth.js";
import type { Booking } from "../types/booking.js";

const bookingStatusSchema = z.enum(["pending", "confirmed", "cancelled"]);

// Fields a client provides; booking_id, status and user_id are filled in by the server.
// user_id is deliberately not in the schema, so it is stripped if a client sends it.
const newBookingBodySchema = z.object({
  property_id: z.string().min(1, "property_id is required"),
  guest_name: z.string().min(1, "guest_name is required"),
  guests: z.number().int().positive("guests must be greater than 0"),
  guest_email: z.string().email("guest_email must be a valid email"),
  check_in: z.string().min(1, "check_in is required"),
  check_out: z.string().min(1, "check_out is required"),
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
