import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";
import { createHash } from "node:crypto";
import { execSql, oneSql, transaction } from "../db";
import type { User } from "../types";
import { now, pricing } from "./config";
import {
  assert,
  AppError,
  cookies,
  cookieHeader,
  hash,
  id,
  requestOrigin,
  token,
} from "./security";

type Account = {
  id: string;
  email: string | null;
  name: string;
  role: User["role"];
  credits: number;
  email_verified: number;
  suspended: number;
  password_hash: string | null;
  stripe_customer_id: string | null;
  created_at: string;
};
export async function account(req: Request): Promise<Account | null> {
  const session = cookies(req).modify_session;
  if (!session) return null;
  const user = await oneSql<Account>(
    "SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at > ?",
    [hash(session), now()],
  );
  if (user?.suspended)
    throw new AppError(
      403,
      "This account has been suspended. Contact support.",
    );
  return user;
}
export async function requireAccount(req: Request, registered = false) {
  const user = await account(req);
  assert(user, "Sign in to access your workspace.", 401);
  if (registered)
    assert(
      user.role !== "guest",
      "Create an account or sign in to continue.",
      401,
    );
  return user;
}
export async function publicUser(userId: string): Promise<User> {
  const row = await oneSql(
    "SELECT u.*, p.locale FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE u.id=?",
    [userId],
  );
  assert(row, "Account not found.", 404);
  const subscription = await oneSql(
    "SELECT plan FROM subscriptions WHERE user_id=? AND status IN ('active','trialing') ORDER BY created_at DESC LIMIT 1",
    [userId],
  );
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    credits: row.credits,
    verified: !!row.email_verified,
    locale: row.locale || "en",
    plan: subscription?.plan || "free",
    created_at: row.created_at,
  };
}
export async function createSession(userId: string, req: Request) {
  const raw = token();
  await execSql(
    "INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)",
    [
      hash(raw),
      userId,
      new Date(Date.now() + 30 * 86400_000).toISOString(),
      now(),
    ],
  );
  return cookieHeader(raw, req);
}
export async function bootstrapAccount(req: Request) {
  const existing = await account(req);
  if (existing) return { user: await publicUser(existing.id), cookie: null };
  const uid = id();
  const { trialCredits } = await pricing();
  await transaction(async () => {
    await execSql(
      "INSERT INTO users(id,name,role,credits,created_at,updated_at) VALUES(?,?,?,?,?,?)",
      [uid, "Your workspace", "guest", trialCredits, now(), now()],
    );
    await execSql("INSERT INTO profiles(user_id) VALUES(?)", [uid]);
    await execSql(
      "INSERT INTO credit_transactions(id,user_id,amount,reason,reference_id,created_at) VALUES(?,?,?,?,?,?)",
      [
        id(),
        uid,
        trialCredits,
        "One-time trial allowance",
        `trial:${uid}`,
        now(),
      ],
    );
  });
  return { user: await publicUser(uid), cookie: await createSession(uid, req) };
}
function emailValue(value: unknown) {
  const email = String(value || "")
    .trim()
    .toLowerCase();
  assert(
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254,
    "Enter a valid email address.",
  );
  return email;
}
function passwordValue(value: unknown) {
  const password = String(value || "");
  assert(
    password.length >= 12 && Buffer.byteLength(password) <= 72,
    "Use a password with at least 12 characters (maximum 72 bytes).",
  );
  return password;
}
async function authLink(
  userId: string,
  kind: "verify" | "reset",
  req: Request,
) {
  const raw = token();
  await execSql("DELETE FROM auth_tokens WHERE user_id=? AND kind=?", [
    userId,
    kind,
  ]);
  await execSql(
    "INSERT INTO auth_tokens(token_hash,user_id,kind,expires_at,created_at) VALUES(?,?,?,?,?)",
    [
      hash(raw),
      userId,
      kind,
      new Date(
        Date.now() + (kind === "reset" ? 30 : 1440) * 60_000,
      ).toISOString(),
      now(),
    ],
  );
  const link = `${requestOrigin(req)}/${kind === "verify" ? "verify-email" : "reset-password"}?token=${raw}`;
  const user = await oneSql("SELECT email FROM users WHERE id=?", [userId]);
  if (process.env.SMTP_HOST && process.env.MAIL_FROM) {
    const smtp = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      ...(process.env.SMTP_USER
        ? {
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASSWORD,
            },
          }
        : {}),
    });
    await smtp.sendMail({
      from: process.env.MAIL_FROM,
      to: user!.email,
      subject:
        kind === "verify"
          ? "Verify your MODIFY AI email"
          : "Reset your MODIFY AI password",
      text: `Your MODIFY AI ${kind === "verify" ? "email verification" : "password reset"} link:\n\n${link}\n\nIf you did not request this, you can ignore this message.`,
    });
  }
  return process.env.NODE_ENV !== "production" ? link : undefined;
}
export async function register(req: Request, body: Record<string, unknown>) {
  const email = emailValue(body.email);
  const password = passwordValue(body.password);
  const name = String(body.name || "").trim();
  assert(
    name.length >= 2 && name.length <= 80,
    "Enter your name (2–80 characters).",
  );
  assert(body.consent === true, "Accept the terms and responsible-use policy.");
  assert(
    !(await oneSql("SELECT id FROM users WHERE email=?", [email])),
    "An account already exists for this email.",
    409,
  );
  if (
    process.env.NODE_ENV === "production" &&
    process.env.REQUIRE_EMAIL_VERIFICATION !== "false"
  )
    assert(
      process.env.SMTP_HOST && process.env.MAIL_FROM,
      "Account registration requires email delivery to be configured.",
      503,
    );
  const guest = await account(req);
  const uid = guest?.role === "guest" ? guest.id : id();
  const passHash = await bcrypt.hash(password, 12);
  const { trialCredits } = await pricing();
  await transaction(async () => {
    if (guest?.role === "guest")
      await execSql(
        "UPDATE users SET email=?, password_hash=?, name=?, role='user', updated_at=? WHERE id=? AND role='guest'",
        [email, passHash, name, now(), uid],
      );
    else {
      await execSql(
        "INSERT INTO users(id,email,password_hash,name,role,credits,created_at,updated_at) VALUES(?,?,?,?,'user',?,?,?)",
        [uid, email, passHash, name, trialCredits, now(), now()],
      );
      await execSql("INSERT INTO profiles(user_id) VALUES(?)", [uid]);
      await execSql(
        "INSERT INTO credit_transactions(id,user_id,amount,reason,reference_id,created_at) VALUES(?,?,?,?,?,?)",
        [
          id(),
          uid,
          trialCredits,
          "One-time trial allowance",
          `trial:${uid}`,
          now(),
        ],
      );
    }
    await execSql("DELETE FROM sessions WHERE user_id=?", [uid]);
  });
  let devLink: string | undefined;
  try {
    devLink = await authLink(uid, "verify", req);
  } catch {
    /* User can resend if the mail server is temporarily unavailable. */
  }
  return {
    user: await publicUser(uid),
    cookie: await createSession(uid, req),
    devLink,
    message:
      "Your account is ready. Verify your email before generating a video.",
  };
}
export async function login(req: Request, body: Record<string, unknown>) {
  const email = emailValue(body.email);
  const user = await oneSql<Account>("SELECT * FROM users WHERE email=?", [
    email,
  ]);
  const valid = await bcrypt.compare(
    String(body.password || ""),
    user?.password_hash ||
      "$2b$12$G1pVvtfLhJxhMl0Q1pgD2OvO9ir4T6s5XIx/64mFI0e8z2D6VSX.a",
  );
  assert(user && valid, "Email or password is incorrect.", 401);
  assert(!user.suspended, "This account is suspended. Contact support.", 403);
  await mergeGuest(req, user.id);
  return {
    user: await publicUser(user.id),
    cookie: await createSession(user.id, req),
  };
}
async function mergeGuest(req: Request, userId: string) {
  const guest = await account(req);
  if (guest?.role !== "guest" || guest.id === userId) return;
  await transaction(async () => {
    for (const table of ["video_uploads", "projects", "character_assets"])
      await execSql(`UPDATE ${table} SET user_id=? WHERE user_id=?`, [
        userId,
        guest.id,
      ]);
    await execSql("DELETE FROM users WHERE id=? AND role=?", [
      guest.id,
      "guest",
    ]);
  });
}
export async function logout(req: Request) {
  const raw = cookies(req).modify_session;
  if (raw)
    await execSql("DELETE FROM sessions WHERE token_hash=?", [hash(raw)]);
  return cookieHeader("", req, 0);
}
export async function requestPasswordReset(
  req: Request,
  body: Record<string, unknown>,
) {
  const user = await oneSql<Account>("SELECT * FROM users WHERE email=?", [
    emailValue(body.email),
  ]);
  let devLink: string | undefined;
  if (user && user.role !== "guest")
    try {
      devLink = await authLink(user.id, "reset", req);
    } catch {
      /* Same response to prevent enumeration. */
    }
  return {
    message: "If an account exists, a password reset link has been sent.",
    devLink,
  };
}
export async function consumeAuthToken(
  req: Request,
  body: Record<string, unknown>,
  kind: "verify" | "reset",
) {
  const raw = String(body.token || "");
  assert(raw.length > 20, "Invalid or expired link.");
  const password =
    kind === "reset"
      ? await bcrypt.hash(passwordValue(body.password), 12)
      : null;
  let uid = "";
  await transaction(async () => {
    const row = await oneSql(
      "SELECT * FROM auth_tokens WHERE token_hash=? AND kind=? AND expires_at > ?",
      [hash(raw), kind, now()],
    );
    assert(
      row,
      "This link has expired or has already been used. Request a new one.",
    );
    uid = row.user_id;
    if (kind === "verify")
      await execSql(
        "UPDATE users SET email_verified=1, updated_at=? WHERE id=?",
        [now(), uid],
      );
    else {
      await execSql(
        "UPDATE users SET password_hash=?,updated_at=? WHERE id=?",
        [password, now(), uid],
      );
      await execSql("DELETE FROM sessions WHERE user_id=?", [uid]);
    }
    await execSql("DELETE FROM auth_tokens WHERE user_id=? AND kind=?", [
      uid,
      kind,
    ]);
  });
  return {
    message:
      kind === "verify"
        ? "Email verified. You’re ready to create."
        : "Password updated. Sign in with your new password.",
    ...(kind === "verify" ? { cookie: await createSession(uid, req) } : {}),
  };
}
export async function resendVerification(req: Request) {
  const user = await requireAccount(req, true);
  assert(!user.email_verified, "Your email is already verified.");
  return {
    message: "Verification email requested.",
    devLink: await authLink(user.id, "verify", req),
  };
}

const oauthKey = () => {
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET)
    throw new AppError(503, "OAuth requires SESSION_SECRET.");
  return new TextEncoder().encode(
    process.env.SESSION_SECRET ||
      "development-only-oauth-signing-key-change-me",
  );
};
const googleJwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
export async function googleStart(req: Request) {
  assert(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
    "Google sign-in is not configured. Use email and password.",
    503,
  );
  const state = token(),
    verifier = token(),
    nonce = token();
  const payload = await new SignJWT({ state, verifier, nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("10m")
    .sign(oauthKey());
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: `${requestOrigin(req)}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      "Set-Cookie": `modify_oauth=${payload}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=600${requestOrigin(req).startsWith("https:") ? "; Secure" : ""}`,
    },
  });
}
export async function googleCallback(req: Request) {
  const url = new URL(req.url);
  const signed = cookies(req).modify_oauth;
  assert(
    signed && url.searchParams.get("code"),
    "Google sign-in was cancelled or expired.",
  );
  const { payload: state } = await jwtVerify(signed, oauthKey(), {
    algorithms: ["HS256"],
  });
  assert(
    state.state === url.searchParams.get("state"),
    "Invalid sign-in state.",
  );
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      code: url.searchParams.get("code")!,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${requestOrigin(req)}/api/auth/google/callback`,
      grant_type: "authorization_code",
      code_verifier: String(state.verifier),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  assert(res.ok, "Google sign-in could not be completed.", 502);
  const credentials = await res.json();
  const { payload: identity } = await jwtVerify(
    credentials.id_token,
    googleJwks,
    {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: process.env.GOOGLE_CLIENT_ID,
    },
  );
  assert(
    identity.nonce === state.nonce &&
      identity.email_verified === true &&
      typeof identity.email === "string",
    "Google could not verify this email.",
    403,
  );
  let user = await oneSql<Account>(
    "SELECT * FROM users WHERE google_id=? OR email=?",
    [String(identity.sub), identity.email.toLowerCase()],
  );
  if (!user) {
    const guest = await account(req);
    const uid = guest?.role === "guest" ? guest.id : id();
    const { trialCredits } = await pricing();
    await transaction(async () => {
      if (guest?.role === "guest")
        await execSql(
          "UPDATE users SET email=?,name=?,google_id=?,email_verified=1,role='user',updated_at=? WHERE id=?",
          [
            String(identity.email).toLowerCase(),
            String(identity.name || "Creator").slice(0, 80),
            String(identity.sub),
            now(),
            uid,
          ],
        );
      else {
        await execSql(
          "INSERT INTO users(id,email,name,google_id,email_verified,role,credits,created_at,updated_at) VALUES(?,?,?,?,1,'user',?,?,?)",
          [
            uid,
            String(identity.email).toLowerCase(),
            String(identity.name || "Creator").slice(0, 80),
            String(identity.sub),
            trialCredits,
            now(),
            now(),
          ],
        );
        await execSql("INSERT INTO profiles(user_id) VALUES(?)", [uid]);
        await execSql(
          "INSERT INTO credit_transactions(id,user_id,amount,reason,reference_id,created_at) VALUES(?,?,?,?,?,?)",
          [
            id(),
            uid,
            trialCredits,
            "One-time trial allowance",
            `trial:${uid}`,
            now(),
          ],
        );
      }
    });
    user = await oneSql<Account>("SELECT * FROM users WHERE id=?", [uid]);
  } else {
    assert(!user.suspended, "This account is suspended.", 403);
    await execSql("UPDATE users SET google_id=?, email_verified=1 WHERE id=?", [
      String(identity.sub),
      user.id,
    ]);
    await mergeGuest(req, user.id);
  }
  const headers = new Headers({ Location: "/" });
  headers.append("Set-Cookie", await createSession(user!.id, req));
  headers.append(
    "Set-Cookie",
    "modify_oauth=; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=0",
  );
  return new Response(null, { status: 302, headers });
}
