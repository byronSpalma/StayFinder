import { Hono } from "hono";
import { supabase } from "../lib/supabaseClient.js";
import type { Property } from "../types/property.js";

export const properties = new Hono();

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
