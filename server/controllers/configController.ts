import { Request, Response } from "express";
import { enabledSocialProviders } from "../lib/socialProviders.js";

/**
 * Public, unauthenticated deployment capabilities.
 *
 * Exists so the client never renders a social sign-in button this deployment
 * cannot service. The alternative — a build-time VITE_SOCIAL_PROVIDERS var —
 * would put the truth in two different dashboards (Render and Vercel) where it
 * can silently drift, and VITE_* is inlined at build time so flipping a
 * provider would need a client redeploy rather than a server restart.
 *
 * Keep this endpoint boring: it must stay safe to serve to anyone, so it
 * reports capability flags only and never configuration values.
 */
export const getPublicConfig = (_req: Request, res: Response) => {
  res.json({ socialProviders: enabledSocialProviders });
};
