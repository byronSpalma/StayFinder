// Types matching the backend's auth responses (src/routes/auth.ts).

export interface SessionUser {
  id: string;
  email: string;
}

// What POST /auth/login and /auth/refresh return on success.
export interface Session {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at?: number;
  user: SessionUser;
}

// What GET /auth/me returns.
export interface MeResponse {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  created_at: string;
}

// What POST /auth/register returns when "Confirm email" is on (no tokens).
export interface RegisterResponse {
  message: string;
  email_confirmation_required: boolean;
}

// Error shapes the backend uses: { error } or { errors: [...] } from Zod.
export interface ApiErrorBody {
  error?: string;
  errors?: { path?: (string | number)[]; message: string }[];
}

// A property as returned by GET /properties and GET /properties/:id.
export interface Property {
  property_id: string;
  title: string;
  description: string;
  location: string;
  price_per_night: number;
  max_guests: number;
  owner_id: string | null;
  image_url: string | null;
}

// Optional filters and sorting for GET /properties (all sent as query params).
export interface PropertyQuery {
  location?: string;
  max_price?: number;
  guests?: number;
  sort?: "price_asc" | "price_desc";
}

// What the client sends when creating or replacing a property.
// property_id and owner_id are set by the server, never by the client.
export interface NewProperty {
  title: string;
  description: string;
  location: string;
  price_per_night: number;
  max_guests: number;
  image_url?: string | null;
}

// What DELETE /properties/:id returns.
export interface DeletePropertyResponse {
  message: string;
  property: Property;
}

// What the client sends when creating a booking.
// booking_id and user_id are set by the server, never by the client.
export interface NewBooking {
  property_id: string;
  guest_name: string;
  guest_email: string;
  check_in: string;
  check_out: string;
  guests: number;
  status?: "pending" | "confirmed" | "cancelled";
}

// A booking as returned by the backend.
export interface Booking extends NewBooking {
  booking_id: string;
  status: "pending" | "confirmed" | "cancelled";
  user_id: string | null;
}
