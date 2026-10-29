import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { bookings } from "./routes/bookings.js";
import { properties } from "./routes/properties.js";

const app = new Hono({ strict: false });

// API routes are registered first so the static handler below never shadows them.
app.route("/bookings", bookings);
app.route("/properties", properties);

app.get("/", serveStatic({ path: "./public/index.html" }));
app.use("/*", serveStatic({ root: "./public" }));

const port = Number(process.env.HONO_PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`StayFinder API listening on http://localhost:${info.port}`);
});
