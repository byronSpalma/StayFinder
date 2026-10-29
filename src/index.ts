import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { bookings } from "./routes/bookings.js";
import { properties } from "./routes/properties.js";

const app = new Hono({ strict: false });

app.use("/*", serveStatic({ root: "./public" }));

app.route("/bookings", bookings);
app.route("/properties", properties);

const port = Number(process.env.HONO_PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`StayFinder API listening on http://localhost:${info.port}`);
});
