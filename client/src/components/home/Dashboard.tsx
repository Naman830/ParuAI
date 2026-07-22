// Was "framer-motion", which is not a declared dependency — it only resolved
// because `motion` hoists it. Every other file imports from "motion/react".
import { motion } from "motion/react";

const floatAnimation = {
  animate: {
    y: [0, -10, 0],
  },
  transition: {
    duration: 4,
    repeat: Infinity,
    // `as const` keeps this an Easing literal instead of widening to string,
    // which failed the type-check and broke `npm run build`.
    ease: "easeInOut" as const,
  },
};

const shimmer =
  "relative overflow-hidden before:absolute before:inset-0 before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-white/10 before:to-transparent";

function DashboardPreview() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 60 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      className="w-full mt-20 relative px-4"
    >
      {/* Glow Background */}
      <div className="absolute inset-0 flex justify-center items-center pointer-events-none">
        <div className="w-[500px] h-[500px] bg-primary/20 blur-[120px] rounded-full animate-pulse" />
      </div>

      <motion.div
        {...floatAnimation}
        className="relative mx-auto w-full max-w-6xl rounded-2xl border border-border-dark bg-surface-dark/60 backdrop-blur-xl shadow-2xl overflow-hidden"
      >
        {/* Browser Bar */}
        <div className="h-10 border-b border-border-dark bg-surface-dark flex items-center px-4 gap-2">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
          <div className="w-3 h-3 rounded-full bg-[#27c93f]" />

          <div className="ml-4 h-6 px-3 flex items-center bg-background-dark/50 rounded-md border border-border-dark/60">
            <span className="text-xs text-text-secondary font-mono">
              paru.ai/dashboard
            </span>
          </div>
        </div>

        {/* Layout */}
        <div className="flex flex-col">
          {/* Navbar */}
          <div className="h-14 border-b border-border-dark flex items-center justify-between px-6 bg-surface-dark/80">
            <motion.div
              whileHover={{ scale: 1.05 }}
              className={`h-6 w-24 bg-primary/50 rounded-md ${shimmer}`}
            />

            <div className="hidden md:flex items-center gap-6">
              {[1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  whileHover={{ y: -2 }}
                  className={`h-4 w-16 bg-border-dark rounded ${shimmer}`}
                />
              ))}
            </div>

            <motion.div
              whileHover={{ scale: 1.1 }}
              className="h-8 w-20 bg-primary rounded-md shadow-lg shadow-primary/40"
            />
          </div>

          {/* Hero */}
          <div className="px-6 py-16 bg-background-dark flex flex-col items-center gap-6">
            <motion.div
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className={`h-8 w-2/3 md:w-1/2 bg-primary/40 rounded-md ${shimmer}`}
            />

            <div className={`h-4 w-3/4 md:w-1/3 bg-border-dark rounded ${shimmer}`} />

            <motion.div
              whileHover={{ scale: 1.05 }}
              className="h-10 w-40 bg-primary rounded-lg"
            />
          </div>

          {/* Features */}
          <div className="px-6 py-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 bg-surface-dark/70">
            {[1, 2, 3].map((i) => (
              <motion.div
                key={i}
                whileHover={{ scale: 1.03, y: -4 }}
                className={`h-32 bg-background-dark border border-border-dark rounded-xl ${shimmer}`}
              />
            ))}
          </div>

          {/* Footer */}
          <div className="h-16 border-t border-border-dark bg-surface-dark/80 flex items-center justify-center">
            <div className={`h-4 w-40 bg-border-dark rounded ${shimmer}`} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default DashboardPreview;