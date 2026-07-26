import {
  ArrowRight,
  Bolt,
  Code,
  MonitorSmartphone,
  Contrast,
} from "lucide-react";

export const Features = () => (
  <section className="py-20 px-6 max-w-[1280px] mx-auto">
    <div className="flex flex-col md:flex-row justify-between md:items-end items-start mb-12 gap-6">
      <div className="max-w-xl">
        <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
          Powering the next generation of web creation
        </h2>
        <p className="text-text-secondary text-lg">
          ParuAI combines advanced LLMs with a real-time rendering engine to
          turn thoughts into production-ready code.
        </p>
      </div>
      <button className=" border border-border-dark bg-surface-dark hover:bg-surface-dark/ px-6 py-3 rounded-full   flex items-center gap-2 group
       hover:border-primary text-foreground transition-colors
      ">
        Explore all features
        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </button>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[300px]">
      <div className="md:col-span-2 row-span-1 rounded-2xl bg-surface-dark border border-border-dark p-8 relative overflow-hidden group">
        <div className="relative z-10 h-full flex flex-col justify-between">
          <div>
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center text-primary mb-4">
              <Bolt className="w-6 h-6" />
            </div>
            <h3 className="text-2xl font-bold text-foreground mb-2">
              Instant Generation
            </h3>
            <p className="text-text-secondary max-w-sm">
              From prompt to full UI in milliseconds. Our engine renders
              components as you type.
            </p>
          </div>
        </div>
        <div className="absolute right-0 bottom-0 w-2/3 h-full opacity-20 group-hover:opacity-30 transition-opacity">
          <div className="absolute inset-0 bg-gradient-to-l from-primary via-transparent to-surface-dark"></div>
          <img
            alt="Cyberpunk city"
            className="w-full h-full object-cover mix-blend-multiply dark:mix-blend-screen"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCq3EPd9iza1zLZpo5vDbJAoVtGBVKLUAi5a_EUl6VHpO3snFbOz6RKgmSbEnpOy0tPBTEpTZcrJm_OAhxN_UDW0VyIS7fWy411VPi832bNVUndyxBTkdIomnxnXRjSzEUi6zb-G6h69tMCSKz3EFFXVOwILDYVzO07GzJl8IwG9tFiLKsR1pvJiHPAGg0b3raGvqhK0jqaAUNx1Xs-SFNXSoeBRyxfNoFjNEjkOXFCqQr0lXV80SN_XdV6zyqMMSHF7RRg9dtNHgl0"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>
      <div className="md:col-span-1 md:row-span-2 rounded-2xl bg-surface-dark border border-border-dark p-8 relative overflow-hidden group">
        <div className="relative z-10 h-full flex flex-col">
          <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400 mb-4">
            <Code className="w-6 h-6" />
          </div>
          <h3 className="text-2xl font-bold text-foreground mb-2">
            Clean React Code
          </h3>
          <p className="text-text-secondary mb-8">
            Export semantic, accessible, and clean React + Tailwind code ready
            for production.
          </p>
          {/* Editor mock: deliberately dark in BOTH themes — the syntax palette
              below is light-on-dark and would be unreadable on a white panel. */}
          <div className="flex-grow bg-[#131118] rounded-xl border border-[#2e2839] p-4 font-mono text-xs text-zinc-400 overflow-hidden opacity-70 group-hover:opacity-100 transition-opacity">
            <div className="flex gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-red-500"></div>
              <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
            </div>
            <p className="text-purple-400">
              export default <span className="text-blue-400">function</span>{" "}
              <span className="text-yellow-300">App</span>() {"{"}
            </p>
            <p className="pl-4 text-zinc-100">return (</p>
            <p className="pl-8 text-blue-300">
              &lt;div <span className="text-green-300">className</span>
              ="p-4"&gt;
            </p>
            <p className="pl-12 text-zinc-100">&lt;Header /&gt;</p>
            <p className="pl-12 text-zinc-100">&lt;Hero /&gt;</p>
            <p className="pl-8 text-blue-300">&lt;/div&gt;</p>
            <p className="pl-4 text-zinc-100">)</p>
            <p className="text-zinc-100">{"}"}</p>
          </div>
        </div>
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>
      </div>
      <div className="md:col-span-1 row-span-1 rounded-2xl bg-surface-dark border border-border-dark p-8 relative overflow-hidden group">
        <div className="relative z-10">
          <div className="w-12 h-12 rounded-xl bg-green-500/20 flex items-center justify-center text-green-400 mb-4">
            <MonitorSmartphone className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">
            Responsive Default
          </h3>
          <p className="text-text-secondary text-sm">
            Every generation is mobile-first and fully responsive out of the
            box.
          </p>
        </div>
      </div>
      <div className="md:col-span-1 row-span-1 rounded-2xl bg-surface-dark border border-border-dark p-8 relative overflow-hidden group hover:border-primary/50 transition-colors">
        <div className="relative z-10">
          <div className="w-12 h-12 rounded-xl bg-pink-500/20 flex items-center justify-center text-pink-400 mb-4">
            <Contrast className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">Theme Control</h3>
          <p className="text-text-secondary text-sm">
            Switch themes, fonts, and border radius with a single click global
            controller.
          </p>
        </div>
      </div>
    </div>
  </section>
);
