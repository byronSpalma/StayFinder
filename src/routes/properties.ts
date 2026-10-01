import { Hono } from "hono";
import { readJson } from "../lib/storage.js";

interface Property {
  property_id: string;
  name: string;
  city: string;
  price_per_night: number;
}

const PROPERTIES_FILE = "properties.json";

export const properties = new Hono();

properties.get("/", async (c) => {
  const allProperties = await readJson<Property[]>(PROPERTIES_FILE);
  return c.json(allProperties);
});

properties.get("/:id", async (c) => {
  const id = c.req.param("id");
  const allProperties = await readJson<Property[]>(PROPERTIES_FILE);
  const property = allProperties.find((p) => p.property_id === id);

  if (!property) {
    return c.json({ error: `Property with id ${id} not found` }, 404);
  }

  return c.json(property);
});
