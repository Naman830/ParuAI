import api from "@/configs/axios";
import { authClient } from "@/lib/auth-client";
import { Sparkles, ArrowRight, Loader2Icon, Zap, LayoutDashboard, ShoppingCart, User, Globe } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import DashboardPreview from "./Dashboard";

const SUGGESTIONS = [
  { label: "Landing Page", icon: Globe, prompt: "A modern SaaS landing page with hero section, features grid, pricing table, and testimonials." },
  { label: "SaaS Dashboard", icon: LayoutDashboard, prompt: "An analytics dashboard with sidebar navigation, charts, KPI cards, and a data table." },
  { label: "Portfolio", icon: User, prompt: "A minimal developer portfolio with about section, project cards, skills, and contact form." },
  { label: "E-commerce", icon: ShoppingCart, prompt: "An e-commerce storefront with product grid, filters sidebar, cart, and checkout flow." },
];

export const Hero = () => {
  const { data: session } = authClient.useSession();
  const navigate = useNavigate();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 260)}px`;
  }, [input]);

  // Ctrl+Enter to submit
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      onSubmitHandler(e as any);
    }
  };

  const onSubmitHandler = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!session?.user) {
        return toast.error("Please sign in to create a project");
      } else if (!input.trim()) {
        return toast.error("Please enter a message");
      }
      setLoading(true);
      const { data } = await api.post("/api/user/project", {
        initial_prompt: input,
      });
      setLoading(false);
      navigate(`/projects/${data.projectId}`);
    } catch (error: any) {
      setLoading(false);
      toast.error(error?.response?.data?.message || error.message);
      console.log(error);
    }
  };

  return (
    <section className="pt-28 pb-24 relative overflow-hidden">
      {/* Grid background */}
      <div className="absolute top-0 left-0 w-full h-screen grid-bg pointer-events-none -z-10 opacity-30" />

      {/* Primary ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] pointer-events-none -z-10">
        <div className="absolute inset-0 bg-primary/15 rounded-full blur-[140px]" />
        <div className="absolute inset-[10%] bg-violet-600/10 rounded-full blur-[100px]" />
      </div>

      {/* Noise texture overlay */}
      <div className="absolute inset-0 pointer-events-none -z-10 opacity-[0.015]"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")", backgroundRepeat: "repeat", backgroundSize: "128px" }}
      />

      <div className="max-w-[1280px] mx-auto px-6 flex flex-col items-center text-center gap-10">

        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full border border-primary/25 bg-primary/8 backdrop-blur-sm cursor-default select-none group hover:border-primary/50 hover:bg-primary/15 transition-all duration-300"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
          </span>
          <Zap className="w-3 h-3 text-primary-light" />
          <span className="text-primary-light text-xs font-semibold uppercase tracking-widest">
            Start your 14-day free trial
          </span>
        </motion.div>

        {/* Headline */}
        <div className="max-w-4xl flex flex-col gap-5">
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="text-5xl md:text-7xl font-bold leading-[1.08] tracking-[-0.02em] text-white"
          >
            Build the future,
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-300 to-primary-light animate-gradient-x">
              prompt by prompt.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-lg md:text-xl text-text-secondary max-w-2xl mx-auto font-light leading-relaxed"
          >
            Describe your dream website and watch{" "}
            <span className="text-white font-medium">ParuAI</span> turn thoughts into
            production-ready code instantly. No config, just create.
          </motion.p>
        </div>

        {/* Input Area */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-3xl relative z-10"
        >
          {/* Animated border glow on focus */}
          <div
            className={`absolute -inset-[1.5px] rounded-2xl transition-opacity duration-500 pointer-events-none ${
              focused ? "opacity-100" : "opacity-0"
            }`}
            style={{
              background: "linear-gradient(135deg, #5b13ec44, #7c42f244, #a855f744, #5b13ec44)",
              filter: "blur(1px)",
            }}
          />

          {/* Static subtle border glow */}
          <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-br from-primary/20 via-transparent to-violet-500/20 pointer-events-none" />

          <form
            onSubmit={onSubmitHandler}
            className="relative rounded-2xl overflow-hidden"
            style={{
              background: "rgba(31, 28, 39, 0.92)",
              backdropFilter: "blur(20px)",
              border: focused ? "1px solid rgba(91, 19, 236, 0.55)" : "1px solid rgba(46, 40, 57, 0.9)",
              boxShadow: focused
                ? "0 0 0 4px rgba(91, 19, 236, 0.08), 0 24px 60px rgba(0,0,0,0.5)"
                : "0 20px 50px rgba(0,0,0,0.4)",
              transition: "border-color 0.25s ease, box-shadow 0.25s ease",
            }}
          >
            {/* Top bar with sparkle and char count */}
            <div className="flex items-center justify-between px-5 pt-4 pb-2 border-b border-white/5">
              <div className="flex items-center gap-2.5">
                <div className={`transition-all duration-300 ${focused ? "text-primary scale-110" : "text-text-secondary"}`}>
                  <Sparkles className="w-4 h-4" />
                </div>
                <span className="text-xs text-text-secondary font-medium tracking-wide">AI Website Builder</span>
              </div>
              <AnimatePresence>
                {input.length > 0 && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    className="text-xs text-text-secondary tabular-nums"
                  >
                    {input.length} chars
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={handleKeyDown}
              rows={4}
              placeholder="A modern portfolio website with glassmorphism, animated sections, and a minimal developer-focused layout..."
              className="w-full resize-none bg-transparent text-white placeholder:text-text-secondary/60 outline-none px-5 pt-3 pb-3 text-base leading-relaxed font-normal tracking-[0.01em]"
              style={{
                minHeight: "110px",
                maxHeight: "260px",
                caretColor: "#7c42f2",
                fontFamily: "inherit",
              }}
            />

            {/* Bottom action bar */}
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-white/5">
              <span className="hidden sm:flex items-center gap-1.5 text-[11px] text-text-secondary/60 select-none">
                <kbd className="px-1.5 py-0.5 rounded bg-white/8 border border-white/10 font-mono text-[10px]">⌘</kbd>
                <kbd className="px-1.5 py-0.5 rounded bg-white/8 border border-white/10 font-mono text-[10px]">↵</kbd>
                <span>to generate</span>
              </span>

              <button
                type="submit"
                disabled={loading}
                className="ml-auto flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
                style={{
                  background: loading
                    ? "rgba(91, 19, 236, 0.5)"
                    : "linear-gradient(135deg, #5b13ec, #7c42f2)",
                  color: "white",
                  boxShadow: loading ? "none" : "0 4px 20px rgba(91, 19, 236, 0.4)",
                }}
                // onMouseEnter={(e) => {
                //   if (!loading) (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 28px rgba(91, 19, 236, 0.6)";
                // }}
                // onMouseLeave={(e) => {
                //   if (!loading) (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 20px rgba(91, 19, 236, 0.4)";
                // }}
              >
                {loading ? (
                  <>
                    <Loader2Icon className="animate-spin w-4 h-4" />
                    <span>Creating…</span>
                  </>
                ) : (
                  <>
                    <span>Create with AI</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Suggestion chips */}
          <div className="flex flex-wrap justify-center gap-2.5 mt-4">
            {SUGGESTIONS.map(({ label, icon: Icon, prompt }) => (
              <button
                key={label}
                type="button"
                onClick={() => setInput(prompt)}
                className="group flex items-center gap-1.5 text-xs text-text-secondary hover:text-white bg-surface-dark/70 hover:bg-primary/15 border border-border-dark hover:border-primary/40 rounded-full px-3.5 py-1.5 transition-all duration-200"
              >
                <Icon className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity" />
                {label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Dashboard Preview */}
        <DashboardPreview />
      </div>
    </section>
  );
};
