import { motion } from "motion/react";



export const Hero = () => (
  <div className="max-w-[1280px] mx-auto px-6 flex flex-col items-center text-center gap-6 mb-16 pt-32">
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 backdrop-blur-sm cursor-pointer hover:bg-primary/20 transition-colors mb-4"
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
      </span>
      <span className="text-primary-light text-xs font-bold uppercase tracking-wider">Scale with us</span>
    </motion.div>
    <motion.h1 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="text-5xl md:text-6xl font-bold leading-tight tracking-tight text-foreground glow-text"
    >
      Simple, transparent pricing
    </motion.h1>
    <motion.p 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="text-lg md:text-xl text-text-secondary max-w-2xl mx-auto font-light leading-relaxed"
    >
      Start for free and scale as you grow. No hidden fees. No surprises. Just pure creation power.
    </motion.p>
  </div>
);