import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import { authClient } from "@/lib/auth-client";
import { useNavigate, NavLink } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { useCallback, useMemo } from "react";
import { useSocialProviders } from "@/lib/useSocialProviders";

export function Providers({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const socialProviders = useSocialProviders();

  // Memoised: AuthUIProvider keys internal memos on this object's identity, so
  // a fresh literal every render would churn every consumer.
  const social = useMemo(
    () => (socialProviders.length ? { providers: socialProviders } : undefined),
    [socialProviders],
  );

  // Without this, `replace` falls back to `navigate` (a push), so the library's
  // invalid-view correction pushes a history entry and the back button walks
  // straight back into the bad URL.
  const replace = useCallback(
    (href: string) => navigate(href, { replace: true }),
    [navigate],
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <AuthUIProvider
        authClient={authClient}
        navigate={navigate}
        replace={replace}
        Link={(props) => <NavLink {...props} to={props.href} />}
        social={social}
        // Enables the "Verify your email / Resend verification email" card in
        // account settings. Bare (not `{ otp: true }`) on purpose: the OTP form
        // would require the emailOTP() server plugin plus emailOTPClient(), and
        // we deliberately use the link-based flow with zero plugins.
        emailVerification
        // The FRONT-END origin, not the API origin. It prefixes the OAuth
        // callbackURL, and the library default of "" yields a bare relative "/",
        // which at the end of GET /api/auth/callback/google resolves against the
        // API host and dumps the user on the API instead of the app.
        // Deliberately NOT API_BASE_URL from configs/axios.ts — that is the API.
        baseURL={window.location.origin}
        // Explicit so the OAuth callbackURL is deterministic rather than
        // depending on a library default.
        redirectTo="/"
      >
        {children}
      </AuthUIProvider>
    </ThemeProvider>
  );
}
