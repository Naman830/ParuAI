import "dotenv/config";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { dash } from "@better-auth/infra";
import prisma from "./prisma.js";
import { sendEmail } from "./email.js";
import { githubCredentials, googleCredentials } from "./socialProviders.js";

// Must match server.ts's parsing exactly. Without the trim, a value like
// "https://a.vercel.app, https://b.app" gave better-auth a space-prefixed
// second origin that never matched, so CORS passed but auth 403'd.
const trustedOrigins =
  process.env.TRUSTED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) || [];

/**
 * Public origin of the frontend. Shared by every outbound link and by the OAuth
 * error redirect, so reset-password, verify-email and OAuth failures can never
 * disagree about where the app lives.
 *
 * The trailing slash is stripped because better-auth's originCheck compares
 * against `new URL(url).origin`, which never has one — an entry like
 * "https://app.vercel.app/" would fail to match and answer 403
 * INVALID_CALLBACK_URL.
 */
const clientBaseURL = (
  process.env.CLIENT_URL?.trim() ||
  trustedOrigins[0] ||
  "http://localhost:5173"
).replace(/\/+$/, "");

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql", // or "mysql", "postgresql", ...etc
  }),

  plugins: [
    // Hosted dashboard + analytics (dash.better-auth.com). Called bare on
    // purpose: the plugin reads BETTER_AUTH_API_KEY from the environment
    // itself, and its option resolver spreads the caller's options *over* the
    // env fallback — so passing `apiKey: process.env.BETTER_AUTH_API_KEY`
    // would write `apiKey: undefined` back over the fallback whenever the var
    // is unset. `dotenv/config` above is what makes the env read work.
    //
    // activityTracking stays off (the default): enabling it adds a
    // `lastActiveAt` column to user, which needs a Prisma migration against
    // the live Neon database.
    dash(),
  ],

  // Conditional spread: a provider with no configured credentials contributes
  // NO key at all, so better-auth skips it and the client renders no button for
  // it. See lib/socialProviders.ts for why half-configured must mean "off".
  socialProviders: {
    ...(googleCredentials ? { google: googleCredentials } : {}),
    ...(githubCredentials ? { github: githubCredentials } : {}),
  },

  emailVerification: {
    // REQUIRED, and not obvious: sendOnSignUp defaults to `undefined`, which
    // better-auth resolves as `sendOnSignUp ?? requireEmailVerification`. We
    // deliberately leave requireEmailVerification OFF (see below), so without
    // this line configuring sendVerificationEmail would send nothing at all.
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      // KEEP better-auth's `url` here. Unlike the reset-password link, the thing
      // that actually flips emailVerified is THIS API's GET /api/auth/verify-email,
      // so the mail must point at the API. Only the callbackURL is wrong:
      // better-auth defaults it to the relative "/", so the post-verification
      // redirect resolves against the API host and dumps the user on the API
      // instead of the app. Rewrite just that one parameter to an absolute
      // client URL. (URLSearchParams does not escape the base64url alphabet or
      // the "." separators, so the JWT survives byte-for-byte.)
      const verifyUrl = new URL(url);
      verifyUrl.searchParams.set("callbackURL", `${clientBaseURL}/?verified=1`);
      const link = verifyUrl.toString();

      await sendEmail({
        to: user.email,
        subject: "Verify your ParuAI email",
        html: `<p>Confirm your email address to finish setting up your ParuAI account:</p><p><a href="${link}">${link}</a></p><p>This link expires in 1 hour. If you didn't create a ParuAI account, you can safely ignore this email.</p>`,
      });
    },
  },

  // OAuth and verification failures otherwise redirect to `${baseURL}/error` —
  // better-auth's own HTML error page on the API host. Point them at the client
  // so the failure lands somewhere the user recognises and AuthStatusToasts can
  // turn ?error=... into a readable message. This affects only the redirect
  // paths; normal JSON API errors are untouched.
  onAPIError: { errorURL: `${clientBaseURL}/auth/sign-in` },

  emailAndPassword: {
    enabled: true,
    // requireEmailVerification stays OFF, deliberately. Turning it on makes
    // sign-in throw 403 EMAIL_NOT_VERIFIED for anyone unverified, and the only
    // resend UI lives in account settings — which needs a session they cannot
    // obtain. Combined with Brevo free-tier deliverability and the fact that
    // send failures are only logged, that is a lockout with no recovery path.
    // Verification still runs (sendOnSignUp above); it just isn't a gate.
    sendResetPassword: async ({ user, token }) => {
      // Build the link straight to the CLIENT reset-password page, not the
      // better-auth `url`. That `url` points at this API's redirect endpoint
      // with a *relative* callbackURL, so clicking it lands on the API domain
      // (paruai-api.onrender.com/auth/reset-password → "Cannot GET"). The
      // reset-password view lives only on the Vercel client, so link there
      // directly with the token — better-auth-ui reads it from `?token=`.
      // clientBaseURL is the module-level constant shared with the verification
      // link and the OAuth error redirect, so the three can never disagree.
      const resetUrl = `${clientBaseURL}/auth/reset-password?token=${token}`;
      await sendEmail({
        to: user.email,
        subject: "Reset your ParuAI password",
        html: `<p>Click the link below to reset your ParuAI password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can safely ignore this email.</p>`,
      });
    },
  },

  user: {
    deleteUser: { enabled: true },
  },

  trustedOrigins,
  baseURL: process.env.BETTER_AUTH_URL!,
  secret: process.env.BETTER_AUTH_SECRET!,
  advanced: {
    cookies: {
      session_token: {
        name: "auth_session",
        attributes: {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          // If env is in development we use lax
          sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
          path: "/",
        },
      },
    },
  },
});