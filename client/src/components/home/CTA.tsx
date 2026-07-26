export const CTA = () => (
  <section className="py-24 px-6 relative overflow-hidden">
    <div
      className="
    absolute top-20 left-1/2 -translate-x-1/2 w-[100px] h-[100px] bg-primary/20 rounded-full blur-[120px] pointer-events-none -z-10 inset-0"
    ></div>
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/20 rounded-full blur-[100px] -z-10"></div>
    <div className="max-w-4xl mx-auto text-center relative z-10">
      <h2 className="text-4xl md:text-6xl font-bold text-foreground mb-8 leading-tight">
        Ready to build something <br />
        amazing today?
      </h2>
      <p className="text-xl text-text-secondary mb-10 max-w-2xl mx-auto">
        Join thousands of developers and designers building faster with ParuAI.
        No credit card required to start.
      </p>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4 w-full max-w-md sm:max-w-none mx-auto">
        <button className="w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 bg-primary text-white rounded-full font-semibold text-base sm:text-lg transition-all duration-300 shadow-[0_0_14px_rgba(91,19,236,0.28)] hover:shadow-[0_0_20px_rgba(91,19,236,0.38)] hover:-translate-y-[1px] active:translate-y-0">
          Get Started for Free
        </button>

        <button className="w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 bg-surface-dark border border-border-dark rounded-full font-semibold text-base sm:text-lg   hover:border-primary text-foreground transition-colors active:translate-y-0">
          View Documentation
        </button>
      </div>
      <p className="mt-6 text-sm text-text-secondary">
        Free tier includes 5 generations per day.
      </p>
    </div>
  </section>
);
