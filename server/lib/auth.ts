import "dotenv/config";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { dash } from "@better-auth/infra";
import prisma from "./prisma.js";
import { sendEmail } from "./email.js";

// Must match server.ts's parsing exactly. Without the trim, a value like
// "https://a.vercel.app, https://b.app" gave better-auth a space-prefixed
// second origin that never matched, so CORS passed but auth 403'd.
const trustedOrigins =
  process.env.TRUSTED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) || [];

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
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, token }) => {
      // Build the link straight to the CLIENT reset-password page, not the
      // better-auth `url`. That `url` points at this API's redirect endpoint
      // with a *relative* callbackURL, so clicking it lands on the API domain
      // (paruai-api.onrender.com/auth/reset-password → "Cannot GET"). The
      // reset-password view lives only on the Vercel client, so link there
      // directly with the token — better-auth-ui reads it from `?token=`.
      const clientBaseURL =
        process.env.CLIENT_URL?.trim() ||
        trustedOrigins[0] ||
        "http://localhost:5173";
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