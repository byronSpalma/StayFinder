import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bookings } from "./routes/bookings.js";
import { properties } from "./routes/properties.js";

const app = new Hono();

app.get("/", (c) => c.json({ message: "StayFinder API is running" }));

app.route("/bookings", bookings);
app.route("/properties", properties);

const port = Number(process.env.HONO_PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`StayFinder API listening on http://localhost:${info.port}`);
});
