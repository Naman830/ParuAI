import { useEffect, useState } from "react";
import api from "@/configs/axios";

/** Providers this client knows how to render. Mirrors server/lib/socialProviders.ts. */
const KNOWN = ["google", "github"] as const;

/**
 * Which social providers the API actually registered.
 *
 * Fetched at runtime rather than baked in with a VITE_* var so that enabling a
 * provider is a server env change plus a restart, not a Vercel redeploy — and so
 * the client can never render a button the server would answer with
 * 404 PROVIDER_NOT_FOUND. Unknown values are filtered out, so a future
 * server-side provider cannot make the UI render a button with no icon.
 *
 * Returns [] until the request resolves; better-auth-ui skips the whole social
 * block (separator included) when the list is empty, so the auth card renders
 * immediately and the buttons fade in — which matters on a Render cold start.
 */
export function useSocialProviders(): string[] {
  const [providers, setProviders] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    api
      .get("/api/public/config")
      .then(({ data }) => {
        if (cancelled) return;
        const list: unknown = data?.socialProviders;
        setProviders(
          Array.isArray(list)
            ? list.filter((p): p is string =>
                (KNOWN as readonly string[]).includes(p),
              )
            : [],
        );
      })
      // Deliberately NOT toast.error, unlike the rest of the app: this runs on
      // every page load, and a Render cold start would nag every visitor. No
      // providers simply means no social buttons, which is a safe degradation.
      .catch((error) => console.log(error));

    return () => {
      cancelled = true;
    };
  }, []);

  return providers;
}
