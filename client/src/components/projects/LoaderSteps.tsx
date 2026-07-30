import {
  CircleIcon,
  SaveIcon,
  ScanLineIcon,
  SquareIcon,
  WifiOffIcon,
  type LucideIcon,
} from "lucide-react";
import type { GenerationPhase } from "../../types";

interface LoaderStepsProps {
  phase: GenerationPhase;
  bytes: number;
  connected: boolean;
}

/**
 * Real generation progress, driven by the SSE stream.
 *
 * This used to cycle four hardcoded labels on a 45s timer regardless of what the
 * server was doing, so it happily showed "Finalizing your Website..." while the
 * model had not yet emitted a single byte. It now only matters for the 40-80s
 * BEFORE the first code byte arrives (the rate-limit pause plus the whole
 * prompt-enhancer call); after that ProjectPreview shows the page building live.
 *
 * `satisfies Record<GenerationPhase, ...>` so adding a phase is a compile error
 * here rather than a runtime undefined.
 */
const STEPS = {
  queued: { icon: ScanLineIcon, label: "Queued — waiting for the model..." },
  enhancing: {
    icon: SquareIcon,
    label: "Expanding your request into a design brief...",
  },
  generating: { icon: CircleIcon, label: "Writing your page..." },
  saving: { icon: SaveIcon, label: "Finalizing and saving your website..." },
} satisfies Record<GenerationPhase, { icon: LucideIcon; label: string }>;

// Matches the ~40KB a real generated page measures, so the bar tracks reality.
const EXPECTED_BYTES = 45000;

const LoaderSteps = ({ phase, bytes, connected }: LoaderStepsProps) => {
  const { icon: Icon, label } = STEPS[phase];
  // Monotonic for free: `bytes` is the channel's cumulative total and never
  // decreases, even when a reconnect replaces the buffer. Capped at 95 because
  // the real total is unknowable until the document is complete.
  const percent = Math.min(95, Math.round((bytes / EXPECTED_BYTES) * 100));

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-background relative overflow-hidden text-foreground">
      <div className="absolute inset-0 bg-linear-to-br from-blue-500/10 via-purple-500/10 to-fuchsia-500/10 blur-3xl animate-pulse"></div>

      <div className="relative z-10 w-32 h-32 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border border-indigo-400 animate-ping opacity-30" />
        <div className="absolute inset-4 rounded-full border border-purple-400/20" />
        <Icon className="w-8 h-8 text-foreground opacity-80 animate-bounce" />
      </div>

      <p
        key={phase}
        className="relative z-10 mt-8 text-lg font-light text-foreground/90 tracking-wide transition-all duration-700 ease-in-out"
      >
        {label}
      </p>

      {bytes > 0 && (
        <div className="relative z-10 mt-6 w-64">
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#7C3AED] to-[#4F46E5] transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {(bytes / 1024).toFixed(1)} KB generated
          </p>
        </div>
      )}

      {connected ? (
        // CLAUDE.md known issue #2: the slowness is real. Don't paper over it.
        <p className="relative z-10 text-xs text-muted-foreground mt-4">
          This usually takes 1-3 minutes on the free model.
        </p>
      ) : (
        <p className="relative z-10 flex items-center gap-1.5 text-xs text-muted-foreground mt-4">
          <WifiOffIcon className="size-3" />
          Live preview unavailable — checking every 10 seconds.
        </p>
      )}
    </div>
  );
};

export default LoaderSteps;
