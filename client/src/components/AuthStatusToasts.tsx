import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";

/**
 * Surfaces auth outcomes that arrive as query params on a redirect landing page.
 *
 *   /?verified=1                            success (GET /api/auth/verify-email)
 *   /?verified=1&error=TOKEN_EXPIRED        failure — better-auth appends with
 *                                           the correct separator, so BOTH params
 *                                           can be present at once
 *   /auth/sign-in?error=account_not_linked  OAuth callback failure, routed here
 *                                           by onAPIError.errorURL in lib/auth.ts
 *
 * Without this the user lands on a page that silently looks normal and has no
 * idea whether the link worked.
 */
const ERROR_MESSAGES: Record<string, string> = {
  TOKEN_EXPIRED:
    "That verification link has expired. Sign in and request a new one from Settings.",
  INVALID_TOKEN:
    "That verification link isn't valid. Request a new one from Settings.",
  USER_NOT_FOUND: "We couldn't find an account for that link.",
  INVALID_USER: "That link belongs to a different account.",
  ACCOUNT_NOT_LINKED:
    "An account with this email already exists. Sign in with your password, then verify your email to enable Google and GitHub sign-in.",
  STATE_MISMATCH: "That sign-in attempt expired. Please try again.",
  STATE_SECURITY_MISMATCH: "That sign-in attempt expired. Please try again.",
  INVALID_CLIENT:
    "Social sign-in isn't configured correctly. Please try again later.",
  PROVIDER_NOT_FOUND: "That sign-in method isn't enabled on this deployment.",
};

export function AuthStatusToasts() {
  const { search } = useLocation();
  const handled = useRef("");

  useEffect(() => {
    if (handled.current === search) return;

    const params = new URLSearchParams(search);
    const error = params.get("error");
    const verified = params.get("verified");
    if (!error && !verified) return;

    handled.current = search;

    // `error` first: a FAILED verification produces both params.
    if (error) {
      // verify-email uses SCREAMING_SNAKE codes, the OAuth callback uses
      // lower_snake, so normalise before lookup.
      toast.error(ERROR_MESSAGES[error.toUpperCase()] ?? `Sign-in failed (${error}).`);
    } else {
      toast.success("Your email address is verified.");
    }

    // Strip the params so a refresh doesn't re-toast. history.replaceState
    // rather than setSearchParams because this is a URL cleanup, not React
    // state — it neither re-renders nor trips react-hooks/set-state-in-effect.
    params.delete("error");
    params.delete("error_description");
    params.delete("verified");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`,
    );
  }, [search]);

  return null;
}
