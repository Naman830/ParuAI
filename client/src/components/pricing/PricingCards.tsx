import { motion } from "motion/react";
import { 
  CheckCircle2, 
  XCircle, 
} from "lucide-react";


export const PricingCards = () => (
  <div className="max-w-[1280px] mx-auto px-6 mb-24">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
      {/* Starter Plan */}
      <motion.div 
        whileHover={{ y: -5 }}
        className="bg-surface-dark border border-border-dark rounded-2xl p-8 flex flex-col h-full hover:border-text-secondary/30 transition-colors"
      >
        <h3 className="text-2xl font-bold text-foreground mb-2">Starter</h3>
        <p className="text-text-secondary text-sm mb-6">Perfect for trying out ParuAI.</p>
        <div className="mb-6">
          <span className="text-4xl font-bold text-foreground">$0</span>
          <span className="text-text-secondary">/month</span>
        </div>
        <button className="w-full py-3 rounded-xl bg-surface-dark border border-border-dark hover:bg-border-dark text-foreground font-bold transition-colors mb-8">
          Get Started
        </button>
        <div className="flex-grow space-y-4">
          <div className="flex items-center gap-3 text-text-secondary text-sm">
            <CheckCircle2 className="text-primary w-5 h-5" />
            <span>5 AI generations per day</span>
          </div>
          <div className="flex items-center gap-3 text-text-secondary text-sm">
            <CheckCircle2 className="text-primary w-5 h-5" />
            <span>Basic React export</span>
          </div>
          <div className="flex items-center gap-3 text-text-secondary text-sm">
            <CheckCircle2 className="text-primary w-5 h-5" />
            <span>Community support</span>
          </div>
          <div className="flex items-center gap-3 text-text-secondary text-sm opacity-50">
            <XCircle className="w-5 h-5" />
            <span>Private projects</span>
          </div>
        </div>
      </motion.div>

      {/* Pro Plan */}
      <motion.div 
        initial={{ scale: 1.02 }}
        whileHover={{ y: -5, scale: 1.03 }}
        className="relative bg-surface-dark/80 backdrop-blur-xl border border-primary/50 rounded-2xl p-8 flex flex-col h-full pro-card-glow md:-mt-4 md:mb-4 z-10"
      >
        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-white text-xs font-bold px-4 py-1 rounded-full uppercase tracking-wider shadow-lg shadow-primary/30">
          Most Popular
        </div>
        <h3 className="text-2xl font-bold text-foreground mb-2">Pro</h3>
        <p className="text-text-secondary text-sm mb-6">For professional developers & teams.</p>
        <div className="mb-6">
          <span className="text-4xl font-bold text-foreground">$29</span>
          <span className="text-text-secondary">/month</span>
        </div>
        <button className="w-full py-3 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold transition-all shadow-lg shadow-primary/20 hover:shadow-primary/40 mb-8">
          Start Free Trial
        </button>
        <div className="flex-grow space-y-4">
          <div className="flex items-center gap-3 text-foreground text-sm font-medium">
            <CheckCircle2 className="text-primary-light w-5 h-5" />
            <span>Unlimited AI generations</span>
          </div>
          <div className="flex items-center gap-3 text-foreground text-sm font-medium">
            <CheckCircle2 className="text-primary-light w-5 h-5" />
            <span>Production-ready React + Tailwind</span>
          </div>
          <div className="flex items-center gap-3 text-foreground text-sm font-medium">
            <CheckCircle2 className="text-primary-light w-5 h-5" />
            <span>Priority email support</span>
          </div>
          <div className="flex items-center gap-3 text-foreground text-sm font-medium">
            <CheckCircle2 className="text-primary-light w-5 h-5" />
            <span>Private projects</span>
          </div>
          <div className="flex items-center gap-3 text-foreground text-sm font-medium">
            <CheckCircle2 className="text-primary-light w-5 h-5" />
            <span>Advanced theme customization</span>
          </div>
        </div>
      </motion.div>

      {/* Enterprise Plan */}
      <motion.div 
        whileHover={{ y: -5 }}
        className="bg-surface-dark border border-border-dark rounded-2xl p-8 flex flex-col h-full hover:border-text-secondary/30 transition-colors"
      >
        <h3 className="text-2xl font-bold text-foreground mb-2">Enterprise</h3>
        <p className="text-text-secondary text-sm mb-6">Custom solutions for large orgs.</p>
        <div className="mb-6">
          <span className="text-4xl font-bold text-foreground">Custom</span>
        </div>
        <button className="w-full py-3 rounded-xl bg-foreground text-background hover:opacity-90 font-bold transition-colors mb-8">
          Contact Sales
        </button>
        <div className="flex-grow space-y-4">
          <div className="flex items-center gap-3 text-text-secondary text-sm">
            <CheckCircle2 className="text-primary w-5 h-5" />
            <span>Everything in Pro</span>
          </div>
          <div className="flex items-center gap-3 text-text-secondary text-sm">
            <CheckCircle2 className="text-primary w-5 h-5" />
            <span>SSO & Advanced Security</span>
          </div>
          <div className="flex items-center gap-3 text-text-secondary text-sm">
            <CheckCircle2 className="text-primary w-5 h-5" />
            <span>Dedicated Success Manager</span>
          </div>
          <div className="flex items-center gap-3 text-text-secondary text-sm">
            <CheckCircle2 className="text-primary w-5 h-5" />
            <span>Custom AI Model Fine-tuning</span>
          </div>
          <div className="flex items-center gap-3 text-text-secondary text-sm">
            <CheckCircle2 className="text-primary w-5 h-5" />
            <span>SLA Guarantee</span>
          </div>
        </div>
      </motion.div>
    </div>
  </div>
);
