import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import { authClient } from "@/lib/auth-client";
import { useNavigate, NavLink } from "react-router-dom";
import { ThemeProvider } from "next-themes";

export function Providers({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <AuthUIProvider
        authClient={authClient}
        navigate={navigate}
        Link={(props) => <NavLink {...props} to={props.href} />}
      >
        {children}
      </AuthUIProvider>
    </ThemeProvider>
  );
}
