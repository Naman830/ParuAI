import { html } from "@codemirror/lang-html";
import { oneDark } from "@codemirror/theme-one-dark";
import CodeMirror from "@uiw/react-codemirror";
import { AlertTriangleIcon, Loader2Icon, RotateCcwIcon, SaveIcon } from "lucide-react";
import { useTheme } from "next-themes";
import type { KeyboardEvent } from "react";

interface CodeEditorPanelProps {
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  isDirty: boolean;
  isSaving: boolean;
  isStale: boolean;
  onReloadFromProject: () => void;
  onRefreshFromPreview: () => void;
}

// Module scope on purpose: a fresh array literal per render makes
// @uiw/react-codemirror dispatch a StateEffect.reconfigure on every render,
// which resets the search panel and burns CPU. A module-level constant has a
// stable identity without useMemo (and so never trips react-hooks/use-memo).
const extensions = [html()];

const CodeEditorPanel = ({
  value,
  onChange,
  onSave,
  isDirty,
  isSaving,
  isStale,
  onReloadFromProject,
  onRefreshFromPreview,
}: CodeEditorPanelProps) => {
  const { resolvedTheme } = useTheme();
  // `resolvedTheme` is undefined on the very first render; falling back to dark
  // matches the app's ThemeProvider defaultTheme="dark".
  const editorTheme = resolvedTheme === "light" ? "light" : oneDark;

  // Cmd/Ctrl+S is handled on the wrapper div and relies on CodeMirror's own
  // keydown bubbling up. Deliberate: a CodeMirror `keymap` extension would mean
  // importing @codemirror/view + @codemirror/state directly, i.e. two phantom
  // dependencies just for one shortcut.
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      onSave();
    }
  };

  return (
    <div
      onKeyDown={handleKeyDown}
      className="flex h-full min-h-0 flex-col bg-card border border-border rounded-2xl overflow-hidden"
    >
      {/* TOOLBAR */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-card">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xs font-medium text-foreground truncate">
            index.html
          </span>
          {isDirty && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-amber-500" />
              Unsaved changes
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefreshFromPreview}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-transparent text-muted-foreground hover:text-foreground hover:border-[#7C3AED] transition"
          >
            Refresh from preview
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-gradient-to-r from-[#7C3AED] to-[#4F46E5] text-white hover:opacity-90 disabled:opacity-50 transition"
          >
            {isSaving ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <SaveIcon className="size-3.5" />
            )}
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* STALE BANNER */}
      {isStale && (
        <div className="flex items-start gap-2.5 px-4 py-2.5 border-b border-amber-500/40 bg-amber-500/10">
          <AlertTriangleIcon className="size-4 shrink-0 mt-px text-amber-600 dark:text-amber-400" />
          <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-200">
            This project changed (an AI revision or a rollback), so these edits
            are based on an older version. Saving will overwrite the newer code.
          </p>
          <button
            type="button"
            onClick={onReloadFromProject}
            className="flex items-center gap-1.5 shrink-0 px-2.5 py-1 text-xs rounded-lg border border-amber-500/50 text-amber-700 dark:text-amber-200 hover:border-[#7C3AED] transition"
          >
            <RotateCcwIcon className="size-3" />
            Reload from project
          </button>
        </div>
      )}

      {/* EDITOR */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <CodeMirror
          value={value}
          onChange={onChange}
          extensions={extensions}
          theme={editorTheme}
          height="100%"
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: true,
            autocompletion: true,
          }}
        />
      </div>
    </div>
  );
};

export default CodeEditorPanel;
