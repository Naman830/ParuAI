import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export const ThemeToggle = () => {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme !== "light";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="flex items-center justify-center rounded-full h-10 w-10 border border-border text-foreground transition-all duration-300 hover:border-primary hover:-translate-y-[1px] active:translate-y-0"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
};
