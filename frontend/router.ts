// Tiny hash router: maps location.hash to a route. No library needed.

export type Route =
  | { name: "list" }
  | { name: "detail"; id: string }
  | { name: "new" }
  | { name: "edit"; id: string }
  | { name: "not-found" };

// Turns "#/properties/property_1001" into a route.
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, "").replace(/\/+$/, "") || "/";
  const parts = path.split("/").filter((part) => part !== "");

  if (parts.length === 0) {
    return { name: "list" };
  }
  if (parts[0] === "properties" && parts.length === 1) {
    return { name: "list" };
  }
  if (parts[0] === "properties" && parts[1] === "new" && parts.length === 2) {
    return { name: "new" };
  }
  if (parts[0] === "properties" && parts.length === 3 && parts[1] && parts[2] === "edit") {
    return { name: "edit", id: decodeURIComponent(parts[1]) };
  }
  if (parts[0] === "properties" && parts.length === 2 && parts[1]) {
    return { name: "detail", id: decodeURIComponent(parts[1]) };
  }
  return { name: "not-found" };
}

// Calls the handler now and every time the hash changes.
export function startRouter(handler: (route: Route) => void): void {
  const onChange = () => handler(parseHash(window.location.hash));
  window.addEventListener("hashchange", onChange);
  onChange();
}
