import { Check, Minus } from "lucide-react";

export const FeatureComparison = () => (
  <div className="max-w-[1000px] mx-auto px-6 mb-20">
    <div className="text-center mb-12">
      <h2 className="text-3xl font-bold text-foreground mb-4">Compare Features</h2>
      <p className="text-text-secondary">
        Detailed breakdown of what's included in each plan.
      </p>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border-dark">
            <th className="py-4 pl-4 text-text-secondary font-medium w-1/3">
              Features
            </th>
            <th className="py-4 px-4 text-center text-foreground font-bold w-1/5">
              Starter
            </th>
            <th className="py-4 px-4 text-center text-primary-light font-bold w-1/5">
              Pro
            </th>
            <th className="py-4 pr-4 text-center text-foreground font-bold w-1/5">
              Enterprise
            </th>
          </tr>
        </thead>
        <tbody className="text-sm">
          <tr className="group">
            <td
              className="py-6 pl-4 text-xs font-bold text-text-secondary uppercase tracking-widest"
              colSpan={4}
            >
              Usage
            </td>
          </tr>
          <tr className="border-b border-border-dark/50 group hover:bg-foreground/5 transition-colors">
            <td className="py-4 pl-4 text-foreground">Generations per day</td>
            <td className="py-4 px-4 text-center text-text-secondary">5</td>
            <td className="py-4 px-4 text-center text-foreground font-bold">
              Unlimited
            </td>
            <td className="py-4 px-4 text-center text-foreground">Unlimited</td>
          </tr>
          <tr className="border-b border-border-dark/50 group hover:bg-foreground/5 transition-colors">
            <td className="py-4 pl-4 text-foreground">Projects</td>
            <td className="py-4 px-4 text-center text-text-secondary">1</td>
            <td className="py-4 px-4 text-center text-foreground font-bold">
              Unlimited
            </td>
            <td className="py-4 px-4 text-center text-foreground">Unlimited</td>
          </tr>
          <tr className="border-b border-border-dark/50 group hover:bg-foreground/5 transition-colors">
            <td className="py-4 pl-4 text-foreground">Team Members</td>
            <td className="py-4 px-4 text-center text-text-secondary">1</td>
            <td className="py-4 px-4 text-center text-foreground font-bold">
              Up to 5
            </td>
            <td className="py-4 px-4 text-center text-foreground">Unlimited</td>
          </tr>

          <tr className="group">
            <td
              className="py-6 pl-4 text-xs font-bold text-text-secondary uppercase tracking-widest"
              colSpan={4}
            >
              Capabilities
            </td>
          </tr>
          <tr className="border-b border-border-dark/50 group hover:bg-foreground/5 transition-colors">
            <td className="py-4 pl-4 text-foreground">Code Export</td>
            <td className="py-4 px-4 text-center text-text-secondary">
              HTML/CSS
            </td>
            <td className="py-4 px-4 text-center text-primary-light">
              <Check className="mx-auto w-5 h-5" />
            </td>
            <td className="py-4 px-4 text-center text-foreground">
              <Check className="mx-auto w-5 h-5" />
            </td>
          </tr>
          <tr className="border-b border-border-dark/50 group hover:bg-foreground/5 transition-colors">
            <td className="py-4 pl-4 text-foreground">Components Library</td>
            <td className="py-4 px-4 text-center text-text-secondary">Basic</td>
            <td className="py-4 px-4 text-center text-foreground font-bold">
              Pro Access
            </td>
            <td className="py-4 px-4 text-center text-foreground">Full Access</td>
          </tr>
          <tr className="border-b border-border-dark/50 group hover:bg-foreground/5 transition-colors">
            <td className="py-4 pl-4 text-foreground">Custom Themes</td>
            <td className="py-4 px-4 text-center text-text-secondary">
              <Minus className="mx-auto w-5 h-5 opacity-30" />
            </td>
            <td className="py-4 px-4 text-center text-primary-light">
              <Check className="mx-auto w-5 h-5" />
            </td>
            <td className="py-4 px-4 text-center text-foreground">
              <Check className="mx-auto w-5 h-5" />
            </td>
          </tr>
          <tr className="border-b border-border-dark/50 group hover:bg-foreground/5 transition-colors">
            <td className="py-4 pl-4 text-foreground">API Access</td>
            <td className="py-4 px-4 text-center text-text-secondary">
              <Minus className="mx-auto w-5 h-5 opacity-30" />
            </td>
            <td className="py-4 px-4 text-center text-text-secondary">
              <Minus className="mx-auto w-5 h-5 opacity-30" />
            </td>
            <td className="py-4 px-4 text-center text-foreground">
              <Check className="mx-auto w-5 h-5" />
            </td>
          </tr>

          <tr className="group">
            <td
              className="py-6 pl-4 text-xs font-bold text-text-secondary uppercase tracking-widest"
              colSpan={4}
            >
              Support
            </td>
          </tr>
          <tr className="border-b border-border-dark/50 group hover:bg-foreground/5 transition-colors">
            <td className="py-4 pl-4 text-foreground">Support Level</td>
            <td className="py-4 px-4 text-center text-text-secondary">
              Community
            </td>
            <td className="py-4 px-4 text-center text-foreground font-bold">
              Priority Email
            </td>
            <td className="py-4 px-4 text-center text-foreground">Dedicated 24/7</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
);
