import { Triangle, Hexagon, Flower2, InfinityIcon, Compass } from "lucide-react";

export const TrustSection = () => (
  <section className="border-y border-border-dark bg-background-dark/50 py-12">
    <div className="max-w-[1280px] mx-auto px-6 text-center">
      <p className="text-sm font-bold text-text-secondary uppercase tracking-widest mb-8">
        Trusted by next-gen builders
      </p>
      <div className="flex flex-wrap justify-center gap-10 md:gap-20 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
        <div className="flex items-center gap-2 text-foreground font-bold text-xl">
          <Triangle className="w-6 h-6" /> AcmeCorp
        </div>
        <div className="flex items-center gap-2 text-foreground font-bold text-xl">
          <Hexagon className="w-6 h-6" /> HexaTech
        </div>
        <div className="flex items-center gap-2 text-foreground font-bold text-xl">
          <Flower2 className="w-6 h-6" /> Bloom
        </div>
        <div className="flex items-center gap-2 text-foreground font-bold text-xl">
          <InfinityIcon className="w-6 h-6" /> Infinity
        </div>
        <div className="flex items-center gap-2 text-foreground font-bold text-xl">
          <Compass className="w-6 h-6" /> NorthStar
        </div>
      </div>
    </div>
  </section>
);
