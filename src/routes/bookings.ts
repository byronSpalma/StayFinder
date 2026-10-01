import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { readJson, writeJson } from "../lib/storage.js";
import type { Booking, NewBooking } from "../types/booking.js";

const BOOKINGS_FILE = "bookings.json";

const bookingStatusSchema = z.enum(["pending", "confirmed", "cancelled"]);

// Fields a client provides; booking_id and status are filled in by the server.
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

export const bookings = new Hono();

bookings.get("/", async (c) => {
  const allBookings = await readJson<Booking[]>(BOOKINGS_FILE);
  return c.json(allBookings);
});

bookings.post("/", zValidator("json", newBookingBodySchema), async (c) => {
  const body = c.req.valid("json");

  const newBooking: Booking = {
  ...body,
    booking_id: `booking_${Math.floor(1000 + Math.random() * 9000)}`,
    status: body.status ?? "pending",
};

  const allBookings = await readJson<Booking[]>(BOOKINGS_FILE);
  allBookings.push(newBooking);
  await writeJson(BOOKINGS_FILE, allBookings);

  return c.json(newBooking, 201);
});

bookings.put("/:id", zValidator("json", newBookingBodySchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const allBookings = await readJson<Booking[]>(BOOKINGS_FILE);
  const index = allBookings.findIndex((b) => b.booking_id === id);
  if (index === -1) {
    return c.json({ error: `Booking with id ${id} not found` }, 404);
  }

  // The id always comes from the URL, never from the request body.
  const updatedBooking: Booking = {
    ...body,
    booking_id: id,
    status: body.status ?? "pending",
  };

  allBookings[index] = updatedBooking;
  await writeJson(BOOKINGS_FILE, allBookings);

  return c.json(updatedBooking);
});

bookings.patch("/:id", zValidator("json", patchBookingBodySchema), async (c) => {
  const id = c.req.param("id");
  const patchData: Partial<NewBooking> = c.req.valid("json");

  const allBookings = await readJson<Booking[]>(BOOKINGS_FILE);
  const index = allBookings.findIndex((b) => b.booking_id === id);
  if (index === -1) {
    return c.json({ error: `Booking with id ${id} not found` }, 404);
  }

  const updatedBooking: Booking = {
    ...allBookings[index],
    ...patchData,
    booking_id: id,
  };

  allBookings[index] = updatedBooking;
  await writeJson(BOOKINGS_FILE, allBookings);

  return c.json(updatedBooking);
});

bookings.delete("/:id", async (c) => {
  const id = c.req.param("id");

  const allBookings = await readJson<Booking[]>(BOOKINGS_FILE);
  const index = allBookings.findIndex((b) => b.booking_id === id);
  if (index === -1) {
    return c.json({ error: `Booking with id ${id} not found` }, 404);
  }

  const [deletedBooking] = allBookings.splice(index, 1);
  await writeJson(BOOKINGS_FILE, allBookings);

  return c.json({ message: "Booking deleted", booking: deletedBooking });
});
