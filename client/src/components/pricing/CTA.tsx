import { HelpCircle } from "lucide-react";

export const CTA = () => (
  <div className="max-w-4xl mx-auto px-6 mb-20">
    <div className="bg-surface-dark border border-border-dark rounded-2xl p-8 md:p-12 text-center relative overflow-hidden">
      <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
        <HelpCircle className="w-32 h-32" />
      </div>
      <h3 className="text-2xl font-bold text-foreground mb-4 relative z-10">Have more questions?</h3>
      <p className="text-text-secondary mb-8 max-w-lg mx-auto relative z-10">Check out our frequently asked questions or contact our support team for help choosing the right plan.</p>
      <div className="flex justify-center gap-4 relative z-10">
        <button className="px-6 py-2.5 bg-background-dark border border-border-dark hover:border-primary text-foreground rounded-full font-medium transition-colors">
          View FAQ
        </button>
        <button className="px-6 py-2.5 bg-transparent hover:bg-background-dark/50 text-text-secondary hover:text-foreground rounded-full font-medium transition-colors">
          Contact Sales
        </button>
      </div>
    </div>
  </div>
);
