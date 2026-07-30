import { useState } from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  GaugeIcon,
  InfoIcon,
  Loader2Icon,
  RefreshCwIcon,
  SparklesIcon,
  XCircleIcon,
  XIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Audit payload types.
 *
 * SOURCE OF TRUTH: `server/lib/audit.ts` — these declarations mirror the shapes
 * that module returns. If the server's audit report changes, change it there
 * first and mirror it here; this panel is purely presentational and never
 * fetches or derives the report itself.
 */
export type AuditCategory = "seo" | "accessibility";
export type AuditSeverity = "critical" | "warning" | "info";

export interface AuditIssue {
  id: string;
  label: string;
  category: AuditCategory;
  severity: AuditSeverity;
  weight: number;
  detail: string;
  samples: string[];
  fix: string;
}

export interface AuditPassed {
  id: string;
  label: string;
  category: AuditCategory;
}

export interface AuditReport {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  seoScore: number;
  accessibilityScore: number;
  issues: AuditIssue[];
  passed: AuditPassed[];
  skipped: AuditPassed[];
  totalWeight: number;
  earnedWeight: number;
}

interface AuditPanelProps {
  report: AuditReport | null;
  fixPrompt: string | null;
  isLoading: boolean;
  isFixing: boolean;
  hasUnsavedEdits: boolean;
  onRunAudit: () => void;
  onFixWithAi: () => void;
  onClose: () => void;
}

interface ScoreStatus {
  /** Status colour, paired with `Icon` + the letter grade so it never stands alone. */
  text: string;
  stroke: string;
  bar: string;
  Icon: LucideIcon;
  label: string;
}

const clampScore = (score: number) =>
  Math.max(0, Math.min(100, Math.round(score)));

// Status states read on both a near-white and a near-black surface, and every
// use pairs the colour with an icon + words.
const statusForScore = (score: number): ScoreStatus => {
  if (score >= 90) {
    return {
      text: "text-emerald-500",
      stroke: "stroke-emerald-500",
      bar: "bg-emerald-500",
      Icon: CheckCircle2Icon,
      label: "Healthy",
    };
  }
  if (score >= 75) {
    return {
      text: "text-amber-500",
      stroke: "stroke-amber-500",
      bar: "bg-amber-500",
      Icon: AlertTriangleIcon,
      label: "Needs work",
    };
  }
  return {
    text: "text-rose-500",
    stroke: "stroke-rose-500",
    bar: "bg-rose-500",
    Icon: XCircleIcon,
    label: "Poor",
  };
};

// Dot colour carries severity; the word beside it carries the same meaning in
// plain ink, so greyscale and colour-blind readers lose nothing.
const SEVERITY_META: Record<AuditSeverity, { dot: string; label: string }> = {
  critical: { dot: "bg-rose-500", label: "Critical" },
  warning: { dot: "bg-amber-500", label: "Warning" },
  info: { dot: "bg-sky-500", label: "Info" },
};

const CATEGORY_LABEL: Record<AuditCategory, string> = {
  seo: "SEO",
  accessibility: "Accessibility",
};

/**
 * The whole payload is one 0-100 scalar plus two sub-scalars, so this is a
 * stat tile, not a chart: an inline ring whose `r` makes the circumference
 * ~100, letting the dash array be the percentage verbatim.
 */
const ScoreRing = ({ score, grade }: { score: number; grade: string }) => {
  const value = clampScore(score);
  const status = statusForScore(value);
  const { Icon } = status;

  return (
    <div className="flex items-center gap-4">
      <div className="relative size-24 shrink-0">
        <svg
          viewBox="0 0 36 36"
          role="img"
          aria-label={`Audit score ${value} out of 100`}
          className="size-24 -rotate-90"
        >
          <circle
            cx="18"
            cy="18"
            r="15.9155"
            fill="none"
            strokeWidth="3"
            className="stroke-border"
          />
          <circle
            cx="18"
            cy="18"
            r="15.9155"
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${value}, 100`}
            className={status.stroke}
          />
        </svg>
        <div
          className="absolute inset-0 flex flex-col items-center justify-center leading-none"
          aria-hidden="true"
        >
          <span className="text-2xl font-semibold tabular-nums text-foreground">
            {value}
          </span>
          <span className={`mt-1 text-[11px] font-medium ${status.text}`}>
            Grade {grade}
          </span>
        </div>
      </div>

      <div className="min-w-0">
        <div className={`flex items-center gap-1.5 ${status.text}`}>
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          <span className="text-sm font-semibold">{status.label}</span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Grade {grade} · SEO and accessibility checks on the saved HTML.
        </p>
      </div>
    </div>
  );
};

const ScoreMeter = ({ label, value }: { label: string; value: number }) => {
  const score = clampScore(value);
  const status = statusForScore(score);

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums text-foreground">
          {score}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted" aria-hidden="true">
        <div
          className={`h-1.5 rounded-full transition-all ${status.bar}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
};

const IssueRow = ({ issue }: { issue: AuditIssue }) => {
  const severity = SEVERITY_META[issue.severity];

  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-1.5 size-2 shrink-0 rounded-full ${severity.dot}`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-sm font-medium text-foreground">
              {issue.label}
            </span>
            <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              {severity.label} · {CATEGORY_LABEL[issue.category]}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {issue.detail}
          </p>
          {issue.samples.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {issue.samples.map((sample, index) => (
                <code
                  key={`${issue.id}-sample-${index}`}
                  className="text-xs font-mono bg-muted rounded px-1 break-all"
                >
                  {sample}
                </code>
              ))}
            </div>
          )}
        </div>
      </div>
    </li>
  );
};

const CollapsibleChecks = ({
  title,
  items,
}: {
  title: string;
  items: AuditPassed[];
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const Chevron = isOpen ? ChevronDownIcon : ChevronRightIcon;

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-medium text-foreground transition hover:bg-muted/60 rounded-xl"
      >
        <Chevron
          className="size-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        {title} ({items.length})
      </button>
      {isOpen && (
        <ul className="border-t border-border px-3 py-2 space-y-1.5">
          {items.length === 0 ? (
            <li className="text-xs text-muted-foreground">Nothing here.</li>
          ) : (
            items.map((item) => (
              <li
                key={item.id}
                className="flex items-baseline gap-2 text-xs text-muted-foreground"
              >
                <span className="text-foreground">{item.label}</span>
                <span className="text-[10px] tracking-wide uppercase">
                  {CATEGORY_LABEL[item.category]}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};

const AuditPanel = ({
  report,
  fixPrompt,
  isLoading,
  isFixing,
  hasUnsavedEdits,
  onRunAudit,
  onFixWithAi,
  onClose,
}: AuditPanelProps) => {
  return (
    <div className="h-full w-full sm:max-w-[22rem] shrink-0 bg-background border-l border-border overflow-y-auto">
      {/* HEADER */}
      <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
            <GaugeIcon className="size-4 text-[#7C3AED]" aria-hidden="true" />
            Site Audit
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            SEO &amp; accessibility · running an audit is free
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close audit panel"
          className="shrink-0 rounded-lg bg-foreground/5 p-1.5 transition hover:bg-foreground/10"
        >
          <XIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        </button>
      </div>

      {isLoading ? (
        <div className="flex h-64 flex-col items-center justify-center gap-3">
          <Loader2Icon
            className="size-6 animate-spin text-[#7C3AED]"
            aria-hidden="true"
          />
          <p className="text-xs text-muted-foreground">Auditing your page…</p>
        </div>
      ) : !report ? (
        /* EMPTY STATE */
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
          <div className="rounded-2xl border border-border bg-card p-3">
            <GaugeIcon
              className="size-6 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <p className="text-sm font-medium text-foreground">No audit yet</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Check the saved HTML for missing meta tags, heading structure, image
            alt text, labels and contrast hints. It costs no credits.
          </p>
          <button
            type="button"
            onClick={onRunAudit}
            className="mt-1 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#4F46E5] px-4 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            <GaugeIcon className="size-4" aria-hidden="true" />
            Run audit
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-5 px-4 py-4">
            {/* SCORE */}
            <ScoreRing score={report.score} grade={report.grade} />

            {/* SUB-SCORES */}
            <div className="space-y-3">
              <ScoreMeter label="SEO" value={report.seoScore} />
              <ScoreMeter
                label="Accessibility"
                value={report.accessibilityScore}
              />
            </div>

            {hasUnsavedEdits && (
              <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/50 p-3">
                <InfoIcon
                  className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  This audit reflects the last <strong>saved</strong> version.
                  You have unsaved visual edits — save them and re-run to score
                  the current page.
                </p>
              </div>
            )}

            {/* FAILED CHECKS */}
            <div>
              <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Failed checks ({report.issues.length})
              </h4>
              {report.issues.length === 0 ? (
                <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
                  <CheckCircle2Icon
                    className="size-4 shrink-0 text-emerald-500"
                    aria-hidden="true"
                  />
                  Everything we check passed. Nice work.
                </div>
              ) : (
                <ul className="space-y-2">
                  {report.issues.map((issue) => (
                    <IssueRow key={issue.id} issue={issue} />
                  ))}
                </ul>
              )}
            </div>

            {/* PASSED / NOT APPLICABLE */}
            <div className="space-y-2">
              <CollapsibleChecks title="Passed" items={report.passed} />
              <CollapsibleChecks
                title="Not applicable"
                items={report.skipped}
              />
            </div>
          </div>

          {/* FOOTER */}
          <div className="sticky bottom-0 space-y-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
            <button
              type="button"
              onClick={onFixWithAi}
              disabled={isFixing || !fixPrompt}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#4F46E5] px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isFixing ? (
                <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <SparklesIcon className="size-4" aria-hidden="true" />
              )}
              {isFixing ? "Applying fixes…" : "Fix with AI - 5 credits"}
            </button>
            <button
              type="button"
              onClick={onRunAudit}
              disabled={isFixing}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCwIcon className="size-3.5" aria-hidden="true" />
              Re-run audit (free)
            </button>
            {!fixPrompt && report.issues.length > 0 && (
              <p className="text-center text-[11px] text-muted-foreground">
                Re-run the audit to build a fix request.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AuditPanel;
