import { Box, Twitter, Github } from "lucide-react";

export const Footer = () => {
  return (
    <footer className="bg-background border-t border-border pt-16 pb-8 px-6">
      <div className="max-w-[1280px] mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-10 mb-16">
          <div className="col-span-2 lg:col-span-2">
            <div className="flex items-center gap-2 text-foreground mb-6">
              <Box className="text-primary w-8 h-8" />
              <span className="text-xl font-bold">ParuAI</span>
            </div>
            <p className="text-muted-foreground max-w-xs mb-6">
              The AI website builder for the modern web. Turn your ideas into
              reality in seconds, not weeks.
            </p>
            <div className="flex gap-4">
              <a
                className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
                href="#"
              >
                <Twitter className="w-5 h-5" />
              </a>
              <a
                className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
                href="#"
              >
                <Github className="w-5 h-5" />
              </a>
            </div>
          </div>
          <div>
            <h4 className="text-foreground font-bold mb-4">Product</h4>
            <ul className="space-y-3">
              {[
                "Features",
                "Integrations",
                "Templates",
                "Pricing",
                "Changelog",
              ].map((item) => (
                <li key={item}>
                  <a
                    className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                    href="#"
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-foreground font-bold mb-4">Resources</h4>
            <ul className="space-y-3">
              {["Documentation", "API Reference", "Community", "Blog"].map(
                (item) => (
                  <li key={item}>
                    <a
                      className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                      href="#"
                    >
                      {item}
                    </a>
                  </li>
                ),
              )}
            </ul>
          </div>
          <div>
            <h4 className="text-foreground font-bold mb-4">Company</h4>
            <ul className="space-y-3">
              {["About", "Careers", "Legal", "Contact"].map((item) => (
                <li key={item}>
                  <a
                    className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                    href="#"
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="border-t border-border pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-muted-foreground text-sm">
            © 2024 ParuAI Inc. All rights reserved.
          </p>
          <div className="flex gap-6">
            <a
              className="text-muted-foreground hover:text-foreground text-sm transition-colors"
              href="#"
            >
              Privacy Policy
            </a>
            <a
              className="text-muted-foreground hover:text-foreground text-sm transition-colors"
              href="#"
            >
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};
