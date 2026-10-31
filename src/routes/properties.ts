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
});

// Returns 400 with { errors: [...] } when the request body fails validation.
const propertyValidator = <T extends z.ZodTypeAny>(schema: T) =>
  zValidator("json", schema, (result, c) => {
    if (!result.success) {
      return c.json({ errors: result.error.issues }, 400);
    }
  });

export const properties = new Hono<{ Variables: AuthVariables }>();

// Reading is open to everyone, so these use the shared client.
properties.get("/", async (c) => {
  const { data, error } = await supabase.from("properties").select("*");
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
