import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { supabase } from "../lib/supabaseClient.js";
import { requireAuth } from "../middleware/auth.js";
import type { AuthVariables } from "../types/auth.js";
import type { NewProperty, Property } from "../types/property.js";

// Fields a client provides. property_id and owner_id are set by the server,
// so they are not in the schema and are stripped if a client sends them.
const newPropertyBodySchema = z.object({
  title: z.string().min(1, "title is required"),
  description: z.string().min(1, "description is required"),
  location: z.string().min(1, "location is required"),
  price_per_night: z.number().positive("price_per_night must be greater than 0"),
  max_guests: z.number().int().positive("max_guests must be greater than 0"),
  image_url: z
    .string()
    .max(2048, "Image URL must be at most 2048 characters")
    .nullable()
    .optional()
    .transform((value) => {
      // Empty string or undefined becomes null (clears the image).
      if (value === undefined || value === null || value.trim() === "") {
        return null;
      }
      return value.trim();
    })
    .refine(
      (value) => {
        if (value === null) {
          return true;
        }
        try {
          const url = new URL(value);
          return url.protocol === "https:";
        } catch {
          return false;
        }
      },
      { message: "Image URL must be a valid https link" }
    ),
});

// Returns 400 with { errors: [...] } when the request body fails validation.
const propertyValidator = <T extends z.ZodTypeAny>(schema: T) =>
  zValidator("json", schema, (result, c) => {
    if (!result.success) {
      return c.json({ errors: result.error.issues }, 400);
    }
  });

// An empty query value (?max_price=) counts as if the parameter was not sent.
const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

// Optional filters and sorting for GET /properties. Unknown parameters are ignored.
const listQuerySchema = z.object({
  location: z.preprocess(emptyToUndefined, z.string().trim().max(100).optional()),
  max_price: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number({ invalid_type_error: "max_price must be a number" })
      .finite("max_price must be a number")
      .positive("max_price must be greater than 0")
      .optional()
  ),
  guests: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number({ invalid_type_error: "guests must be a number" })
      .int("guests must be a whole number")
      .positive("guests must be greater than 0")
      .optional()
  ),
  sort: z.preprocess(
    emptyToUndefined,
    z.enum(["price_asc", "price_desc"], {
      errorMap: () => ({ message: "sort must be price_asc or price_desc" }),
    }).optional()
  ),
});

// Same 400 { errors: [...] } format, but for query parameters.
const listQueryValidator = zValidator("query", listQuerySchema, (result, c) => {
  if (!result.success) {
    return c.json({ errors: result.error.issues }, 400);
  }
});

// In LIKE/ILIKE patterns % matches any text and _ matches one character.
// Escaping them (and the backslash itself) makes the user's text match literally.
const escapeLike = (text: string) => text.replace(/[\\%_]/g, "\\$&");

export const properties = new Hono<{ Variables: AuthVariables }>();

// Reading is open to everyone, so these use the shared client.
properties.get("/", listQueryValidator, async (c) => {
  const { location, max_price, guests, sort } = c.req.valid("query");

  let query = supabase.from("properties").select("*");

  if (location) {
    query = query.ilike("location", `%${escapeLike(location)}%`);
  }
  if (max_price !== undefined) {
    query = query.lte("price_per_night", max_price);
  }
  if (guests !== undefined) {
    query = query.gte("max_guests", guests);
  }
  // Sorting is done by the database. Without sort the order is unchanged.
  if (sort) {
    query = query.order("price_per_night", { ascending: sort === "price_asc" });
  }

  const { data, error } = await query;
  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data as Property[]);
});

// GET /properties/mine must be registered BEFORE GET /:id, otherwise "mine"
// would be interpreted as a property id.
properties.get("/mine", requireAuth, async (c) => {
  const userId = c.get("user").id;

  const { data, error } = await c.get("db")
    .from("properties")
    .select("*")
    .eq("owner_id", userId);

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data as Property[]);
});

properties.get("/:id", async (c) => {
  const id = c.req.param("id");
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .eq("property_id", id)
    .maybeSingle();

  if (error) {
    return c.json({ error: error.message }, 500);
  }
  if (!data) {
    return c.json({ error: `Property with id ${id} not found` }, 404);
  }

  return c.json(data as Property);
});

// Writing requires a logged-in user, and uses the client carrying that user's JWT.
properties.post("/", requireAuth, propertyValidator(newPropertyBodySchema), async (c) => {
  const body: NewProperty = c.req.valid("json");

  const newProperty: Property = {
    ...body,
    property_id: `property_${randomUUID().slice(0, 8)}`,
    // The owner always comes from the verified token, never from the request body.
    owner_id: c.get("user").id,
    // image_url is null when not provided (the transform in the schema handles this).
    image_url: body.image_url ?? null,
  };

  const { data, error } = await c.get("db")
    .from("properties")
    .insert(newProperty)
    .select()
    .single();

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json(data as Property, 201);
});

properties.put("/:id", requireAuth, propertyValidator(newPropertyBodySchema), async (c) => {
  const id = c.req.param("id");
  const body: NewProperty = c.req.valid("json");

  // Only the NewProperty fields are updated: property_id and owner_id never change.
  const { data, error } = await c.get("db")
    .from("properties")
    .update(body)
    .eq("property_id", id)
    .select()
    .maybeSingle();

  if (error) {
    return c.json({ error: error.message }, 500);
  }
  if (!data) {
    return c.json({ error: `Property with id ${id} not found` }, 404);
  }

  return c.json(data as Property);
});

properties.delete("/:id", requireAuth, async (c) => {
  const id = c.req.param("id");

  const { data, error } = await c.get("db")
    .from("properties")
    .delete()
    .eq("property_id", id)
    .select()
    .maybeSingle();

  if (error) {
    // 23503 = foreign key violation: bookings still point to this property.
    if (error.code === "23503") {
      return c.json({ error: "Property has bookings and cannot be deleted" }, 409);
    }
    return c.json({ error: error.message }, 500);
  }
  if (!data) {
    return c.json({ error: `Property with id ${id} not found` }, 404);
  }

  return c.json({ message: "Property deleted", property: data as Property });
});
