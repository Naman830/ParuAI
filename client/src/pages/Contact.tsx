import FAQ from "@/components/Faq";
import { motion } from "motion/react";

export default function ContactForm() {
  return (
    <div className="min-h-screen relative overflow-x-hidden">
      {/* Background Elements */}
      <div className="absolute top-0 left-0 w-full h-screen grid-bg pointer-events-none -z-10 opacity-40"></div>
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-primary/20 rounded-full blur-[120px] pointer-events-none -z-10"></div>

      {/* HERO */}
      <section className="relative px-6 pt-28 pb-20 text-center max-w-full mx-auto">
        {/* glow background */}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-foreground/5 border border-border text-primary text-xs font-semibold tracking-wide mb-8"
        >
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          Talk to an Expert
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-4xl md:text-6xl font-bold tracking-tight leading-tight mb-6"
        >
          Build smarter with{" "}
          <span className="bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
            Enterprise AI
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto"
        >
          Tell us what you're building. We'll help you scale it with powerful,
          production-ready AI systems tailored to your needs.
        </motion.p>
      </section>

      {/* FORM */}
      <section className="px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto rounded-2xl border border-border bg-card/70 backdrop-blur-xl p-6 md:p-10"
        >
          <form
            className="grid grid-cols-1 md:grid-cols-2 gap-5"
            onSubmit={(e) => e.preventDefault()}
          >
            {/* Input component */}
            {[
              { label: "Full Name", placeholder: "John Doe", type: "text" },
              {
                label: "Work Email",
                placeholder: "john@company.com",
                type: "email",
              },
            ].map((field, i) => (
              <div key={i}>
                <label className="text-sm text-muted-foreground mb-2 block">
                  {field.label}
                </label>
                <input
                  type={field.type}
                  placeholder={field.placeholder}
                  className="w-full bg-foreground/5 border border-border rounded-xl px-4 py-3 
                  focus:border-primary focus:ring-1 focus:ring-primary 
                  outline-none transition-all placeholder:text-muted-foreground"
                />
              </div>
            ))}

            {/* Select */}
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">
                Company Size
              </label>
              <select
                className="w-full bg-foreground/5 border border-border rounded-xl px-4 py-3 
                focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              >
                <option>1–50 employees</option>
                <option>51–200 employees</option>
                <option>201–1000 employees</option>
                <option>1000+ employees</option>
              </select>
            </div>

            {/* Industry */}
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">
                Industry
              </label>
              <input
                type="text"
                placeholder="e.g. Fintech"
                className="w-full bg-foreground/5 border border-border rounded-xl px-4 py-3 
                focus:border-primary focus:ring-1 focus:ring-primary outline-none placeholder:text-muted-foreground"
              />
            </div>

            {/* Textarea */}
            <div className="md:col-span-2">
              <label className="text-sm text-muted-foreground mb-2 block">
                What are you building?
              </label>
              <textarea
                rows={4}
                placeholder="Describe your product, goals, or AI use-case..."
                className="w-full bg-foreground/5 border border-border rounded-xl px-4 py-3 
                focus:border-primary focus:ring-1 focus:ring-primary outline-none resize-none placeholder:text-muted-foreground"
              />
            </div>

            {/* Button */}
            <div className="md:col-span-2 pt-2">
              <button
                type="submit"
                className="w-full py-3 rounded-xl font-semibold bg-primary 
                hover:bg-primary/90 transition-all 
                "
              >
                Get in Touch
              </button>

              <p className="text-xs text-center text-muted-foreground mt-4">
                We respect your privacy. No spam. Just helpful responses.
              </p>
            </div>
          </form>
        </motion.div>
      </section>

      {/* FAQ */}
      <div className="">
        <FAQ />
      </div>
    </div>
  );
}
