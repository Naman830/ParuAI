import { Box, Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useNavigate, Link } from "react-router-dom";
import { authClient } from "@/lib/auth-client";
import {UserButton} from '@daveyplate/better-auth-ui'
import api from "@/configs/axios";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import { useCallback } from "react";

export const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const [credits, setCredits] = useState(0)

  const {data: session} = authClient.useSession()


  const getCredits = useCallback(async () => {
    try {
      const {data} = await api.get('/api/user/credits')
      setCredits(data.credits)
    } catch (error) {
      toast.error(getErrorMessage(error))
      console.log(error);
    }
  }, [])

  useEffect(() => {
    if (session?.user) {
      // Fetching the credit balance when a session appears is the "subscribe to
      // an external system" case; there is no render-time source for this value.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      getCredits()
    }
  }, [session?.user, getCredits]);


  return (
    <nav className="top-0 left-0 right-0 z-50 glass-nav border-b border-border-dark">
      <div className="relative max-w-[1280px] mx-auto px-6 h-20 flex items-center">
        {/* Left */}
        <Link to="/" className="flex items-center gap-3 text-white">
          <div className="text-primary">
            <Box className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold tracking-tight">ParuAI</h2>
        </Link>

        {/* Center - TRUE CENTER */}
        <div className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center gap-8">
          {[
            { name: "Home", to: "/" },
            { name: "My Projects", to: "/projects" },
            { name: "Community", to: "/community" },
            { name: "Pricing", to: "/pricing" },
            { name: "Contact", to: "/contact" },
          ].map((item) => (
            <Link
              key={item.name}
              to={item.to}
              className="text-text-secondary hover:text-white transition-colors text-sm font-medium"
            >
              {item.name}
            </Link>
          ))}
        </div>
        {/* Right */}
        <div className="ml-auto flex items-center gap-4">
          {/* Desktop CTA */}
          {!session?.user ? (

            <button
            onClick={() => navigate("/auth/signin")}
            className="hidden md:flex items-center justify-center rounded-full h-10 px-6 bg-primary text-white text-sm font-semibold transition-all duration-300 shadow-[0_0_12px_rgba(91,19,236,0.25)] hover:shadow-[0_0_18px_rgba(91,19,236,0.35)] hover:-translate-y-[1px] active:translate-y-0"
          >
            Get Started
          </button>
          ): (
            <>
              <button className="bg-white/10 px-5 py-1.5 text-xs sm:text-sm border text-gray-200 rounded-full">Credits : <span className="text-indigo-300">{credits}</span></button>
            <UserButton size='icon'/>
            </>
          )
            
        }

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden flex items-center justify-center rounded-full h-10 w-10 bg-primary text-white transition-all duration-300 shadow-[0_0_12px_rgba(91,19,236,0.25)] hover:shadow-[0_0_18px_rgba(91,19,236,0.35)] hover:-translate-y-[1px] active:translate-y-0"
          >
            {isOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          {/* Dropdown animation */}
          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className="md:hidden absolute top-full left-0 w-full bg-surface-dark/95 backdrop-blur-xl border-t border-border-dark shadow-2xl overflow-hidden"
              >
                <motion.div
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  variants={{
                    hidden: {
                      transition: {
                        staggerChildren: 0.05,
                        staggerDirection: -1,
                      },
                    },
                    visible: { transition: { staggerChildren: 0.08 } },
                  }}
                  className="flex flex-col items-center py-8 gap-6 text-white"
                >
                  {[
                    { name: "Home", to: "/" },
                    { name: "My Projects", to: "/projects" },
                    { name: "Community", to: "/community" },
                    { name: "Pricing", to: "/pricing" },
                  ].map((item) => (
                    <motion.div
                      key={item.name}
                      variants={{
                        hidden: { opacity: 0, y: -10 },
                        visible: { opacity: 1, y: 0 },
                      }}
                      transition={{ duration: 0.3 }}
                    >
                      <Link
                        to={item.to}
                        onClick={() => setIsOpen(false)}
                        className="text-sm font-medium hover:text-primary transition-colors"
                      >
                        {item.name}
                      </Link>
                    </motion.div>
                  ))}

                  <motion.div
                    variants={{
                      hidden: { opacity: 0, y: -10 },
                      visible: { opacity: 1, y: 0 },
                    }}
                    transition={{ duration: 0.3 }}
                    className="mt-4"
                  >
                    <Link
                      to="/auth/signin"
                      onClick={() => setIsOpen(false)}
                      className="rounded-full h-10 px-6 flex items-center justify-center bg-primary text-white text-sm font-semibold shadow-[0_0_12px_rgba(91,19,236,0.25)] hover:shadow-[0_0_18px_rgba(91,19,236,0.35)] active:scale-95 transition-all duration-300"
                    >
                      Get Started
                    </Link>
                  </motion.div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </nav>
  );
};
