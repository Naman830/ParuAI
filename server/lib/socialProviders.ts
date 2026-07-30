import "dotenv/config";

/**
 * OAuth credentials read from the environment, one entry per provider.
 *
 * Single source of truth, shared by lib/auth.ts (which registers the providers)
 * and GET /api/public/config (which tells the client which buttons to render).
 * Same anti-drift discipline the repo already applies to TRUSTED_ORIGINS.
 *
 * Both id AND secret are required, because a half-configured provider is worse
 * than an absent one: an unset clientId does NOT throw at better-auth init — it
 * only logs a warning and still registers the provider — so the button renders
 * and dead-ends on the provider's own invalid_client page. Passing `undefined`
 * for the whole provider instead makes better-auth skip it cleanly.
 *
 * Provider keys must be lowercase and must exist in better-auth's provider map;
 * an unknown key like "Google" throws "socialProviders[key] is not a function"
 * at boot.
 */
const readCredentials = (prefix: "GOOGLE" | "GITHUB") => {
  const clientId = process.env[`${prefix}_CLIENT_ID`]?.trim();
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`]?.trim();
  if (!clientId || !clientSecret) return undefined;
  return { clientId, clientSecret };
};

export const googleCredentials = readCredentials("GOOGLE");
export const githubCredentials = readCredentials("GITHUB");

/**
 * The providers actually registered with better-auth. GET /api/public/config
 * reports exactly this list, so the client can never render a button the server
 * would answer with 404 PROVIDER_NOT_FOUND.
 */
export const enabledSocialProviders: string[] = [
  ...(googleCredentials ? ["google"] : []),
  ...(githubCredentials ? ["github"] : []),
];
