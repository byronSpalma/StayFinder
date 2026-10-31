import { Hono } from "hono";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AuthError, AuthSession } from "@supabase/supabase-js";
import { createAuthClient } from "../lib/supabaseClient.js";
import { getBearerToken, requireAuth } from "../middleware/auth.js";
import type { AuthVariables } from "../types/auth.js";

const emailSchema = z
  .string({ required_error: "email is required" })
  .trim()
  .toLowerCase()
  .email("email must be a valid email");

const registerBodySchema = z.object({
  email: emailSchema,
  // 72 is bcrypt's limit; the project's own minimum may be stricter in Supabase.
  password: z
    .string({ required_error: "password is required" })
    .min(8, "password must be at least 8 characters")
    .max(72, "password must be at most 72 characters"),
});

const loginBodySchema = z.object({
  email: emailSchema,
  password: z
    .string({ required_error: "password is required" })
    .min(1, "password is required"),
});

const refreshBodySchema = z.object({
  refresh_token: z
    .string({ required_error: "refresh_token is required" })
    .min(1, "refresh_token is required"),
});

// Returns 400 with { errors: [...] } when the request body fails validation.
const authValidator = <T extends z.ZodTypeAny>(schema: T) =>
  zValidator("json", schema, (result, c) => {
    if (!result.success) {
      return c.json({ errors: result.error.issues }, 400);
    }
  });

type ErrorResult = { status: ContentfulStatusCode; message: string };

// Translates a Supabase Auth error into an HTTP status and a safe message.
// Only the error code is logged: never passwords or tokens.
function toErrorResult(error: AuthError, fallbackMessage: string): ErrorResult {
  switch (error.code) {
    case "invalid_credentials":
      return { status: 401, message: "Invalid email or password" };
    case "email_not_confirmed":
      return {
        status: 403,
        message: "Email not confirmed. Follow the link in the confirmation email first.",
      };
    case "user_already_exists":
    case "email_exists":
      return { status: 409, message: "An account with this email already exists" };
    case "weak_password":
      return { status: 422, message: "Password does not meet the project's requirements" };
    case "email_address_invalid":
      return { status: 400, message: "The email address is not valid" };
    case "email_address_not_authorized":
      return { status: 403, message: "Confirmation emails cannot be sent to this address" };
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return { status: 429, message: "Too many requests. Try again later." };
    default:
      console.error(`Auth error: code=${error.code ?? "none"} status=${error.status ?? "none"}`);
      return { status: 500, message: fallbackMessage };
  }
}

function sendError(c: Context, error: AuthError, fallbackMessage: string) {
  const { status, message } = toErrorResult(error, fallbackMessage);
  return c.json({ error: message }, status);
}

// The only session fields the client needs; the rest of Supabase's object is not exposed.
function toSessionBody(session: AuthSession) {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: session.token_type,
    expires_in: session.expires_in,
    expires_at: session.expires_at,
    user: { id: session.user.id, email: session.user.email },
  };
}

export const auth = new Hono<{ Variables: AuthVariables }>();

auth.post("/register", authValidator(registerBodySchema), async (c) => {
  const { email, password } = c.req.valid("json");

  const { data, error } = await createAuthClient().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: process.env.EMAIL_REDIRECT_URL },
  });

  if (error) {
    return sendError(c, error, "Registration failed");
  }

  // With "Confirm email" on, Supabase creates the user but returns no session.
  if (!data.session) {
    return c.json(
      {
        message: "Registration received. Confirm your email address before logging in.",
        email_confirmation_required: true,
      },
      201
    );
  }

  return c.json(toSessionBody(data.session), 201);
});

auth.post("/login", authValidator(loginBodySchema), async (c) => {
  const { email, password } = c.req.valid("json");

  const { data, error } = await createAuthClient().auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    return error
      ? sendError(c, error, "Login failed")
      : c.json({ error: "Login failed" }, 500);
  }

  return c.json(toSessionBody(data.session));
});

auth.post("/refresh", authValidator(refreshBodySchema), async (c) => {
  const { refresh_token } = c.req.valid("json");

  const { data, error } = await createAuthClient().auth.refreshSession({ refresh_token });

  if (error || !data.session) {
    // Any 4xx from Supabase means the refresh token is unusable.
    if (error && (error.status === undefined || error.status >= 500)) {
      return sendError(c, error, "Could not refresh the session");
    }
    return c.json({ error: "Invalid or expired refresh token" }, 401);
  }

  return c.json(toSessionBody(data.session));
});

// Ends the session on Supabase's side (scope "local": only this session).
// The access token itself is a signed JWT and stays valid until it expires, so
// the client must also delete both tokens.
auth.post("/logout", authValidator(refreshBodySchema), async (c) => {
  const accessToken = getBearerToken(c.req.header("Authorization"));
  if (!accessToken) {
    return c.json({ error: "Missing or malformed Authorization header" }, 401);
  }
  const { refresh_token } = c.req.valid("json");

  // A fresh client holds this one user's session only for the duration of the request.
  const client = createAuthClient();
  const { error: sessionError } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token,
  });
  if (sessionError) {
    return c.json({ error: "Invalid or expired tokens" }, 401);
  }

  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) {
    return sendError(c, error, "Logout failed");
  }

  return c.json({ message: "Logged out" });
});

auth.get("/me", requireAuth, (c) => {
  const user = c.get("user");
  return c.json({
    id: user.id,
    email: user.email,
    email_confirmed_at: user.email_confirmed_at,
    created_at: user.created_at,
  });
});
