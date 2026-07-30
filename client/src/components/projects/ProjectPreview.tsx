import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from "react";
import type {
  DeviceType,
  ElementUpdate,
  Project,
  SelectedElement,
  StreamState,
} from "../../types";
import { iframeScript } from "../../assets/assets";
import { ensureDoctype } from "@/lib/htmlDoc";
import EditorPanel from "./EditorPanel";
import LoaderSteps from "./LoaderSteps";

interface ProjectPreviewProps {
  project: Project;
  isGenerating: boolean;
  device?: DeviceType;
  showEditorPanel?: boolean;
  /**
   * Renders this instead of project.current_code — the applied code-editor
   * buffer. Changing it reloads the iframe, so the parent only sets it on an
   * explicit apply, never per keystroke.
   */
  sourceCode?: string | null;
  /** Live partial HTML from the SSE stream. Read-only, never injected, never saved. */
  streamingCode?: string;
  streamProgress?: StreamState;
}

export interface ProjectPreviewRef {
  getCode: () => string | undefined;
  clearSelection: () => void;
  hasVisualEdits: () => boolean;
}

const EMPTY_PROGRESS: StreamState = {
  text: "",
  phase: "queued",
  bytes: 0,
  truncated: false,
  connected: false,
};

const ProjectPreview = forwardRef<ProjectPreviewRef, ProjectPreviewProps>(
  (
    {
      project,
      device = "desktop",
      isGenerating,
      showEditorPanel = true,
      sourceCode,
      streamingCode,
      streamProgress,
    },
    ref,
  ) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const streamFrameRef = useRef<HTMLIFrameElement>(null);
    const writtenRef = useRef(0);
    const visualEditsRef = useRef(false);
    const [selectedElement, setSelectedElement] =
      useState<SelectedElement | null>(null);

    const resolutions = {
      phone: "w-[412px]",
      tablet: "w-[768px]",
      desktop: "w-full",
    };

    const html = sourceCode ?? project.current_code;
    const isStreaming = Boolean(streamingCode);
    const progress = streamProgress ?? EMPTY_PROGRESS;

    // allow-same-origin is required ONLY by the builder, where getCode() and the
    // streaming document.write read the iframe's contentDocument. It is
    // deliberately WITHHELD for public/untrusted renders (View, Preview, and any
    // other showEditorPanel={false} caller): a srcDoc frame with allow-same-origin
    // runs in the PARENT app's origin, so a published site's own <script> can
    // reach window.parent, read the app DOM, and fire credentialed fetches to the
    // API as whoever is viewing it — a stored-XSS / account-data-theft path
    // through the community gallery (verified live). Dropping it forces an opaque
    // origin: the page still runs its own scripts but cannot touch the app, its
    // cookies, or make same-origin API calls. Only the owner's own code is ever
    // rendered with same-origin, and only in the builder.
    const sandbox = showEditorPanel
      ? "allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
      : "allow-scripts allow-popups allow-forms allow-modals";

    const clearSelection = () => {
      setSelectedElement(null);
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          { type: "CLEAR_SELECTION_REQUEST" },
          "*",
        );
      }
    };

    useImperativeHandle(ref, () => ({
      getCode: () => {
        // Never serialize a partial document. Branch 1 wins while streaming so
        // iframeRef is null anyway, but state the intent so a future refactor
        // cannot quietly persist half a page.
        if (isStreaming || !html) return undefined;

        const doc = iframeRef.current?.contentDocument;
        if (!doc) return undefined;

        // Strip on a CLONE, not the live document. This used to mutate the real
        // iframe DOM, so after one getCode() the injected #ai-preview-script was
        // gone and click-to-select was dead until srcDoc changed. Save happened
        // to heal it (the refetch reloads the iframe); Download did not. The
        // Code tab calls this on every switch, so it had to stop being
        // destructive. outerHTML on a detached element is valid — only the
        // setter requires a parent.
        const root = doc.documentElement.cloneNode(true) as HTMLElement;

        // 1. Remove our selection class / attributes / outline from all elements
        root
          .querySelectorAll(".ai-selected-element, [data-ai-selected]")
          .forEach((el) => {
            el.classList.remove("ai-selected-element");
            el.removeAttribute("data-ai-selected");
            (el as HTMLElement).style.outline = "";
          });

        // 2. Remove injected style + script from the clone
        const previewStyle = root.querySelector("#ai-preview-style");
        if (previewStyle) previewStyle.remove();

        const previewScript = root.querySelector("#ai-preview-script");
        if (previewScript) previewScript.remove();

        // 3. Serialize clean Html. outerHTML never includes the doctype, and
        // persisting it without one puts every later render into quirks mode.
        return ensureDoctype(root.outerHTML);
      },
      clearSelection,
      hasVisualEdits: () => visualEditsRef.current,
    }));

    useEffect(() => {
      const handleMessage = (event: MessageEvent) => {
        // The preview runs arbitrary generated JS, and any page can postMessage
        // here — only accept messages from our own iframe.
        //
        // Do NOT widen this to also accept the streaming frame: while streaming,
        // iframeRef.current is null so every message is rejected, which is
        // exactly right. A half-built document must not drive the editor.
        if (event.source !== iframeRef.current?.contentWindow) return;

        if (event.data?.type === "ELEMENT_SELECTED") {
          setSelectedElement(event.data.payload as SelectedElement);
        } else if (event.data?.type === "CLEAR_SELECTION") {
          setSelectedElement(null);
        }
      };
      window.addEventListener("message", handleMessage);
      return () => window.removeEventListener("message", handleMessage);
    }, []);

    // A new document means any previous in-DOM visual edits are gone with it.
    // Writing a ref inside an effect is fine; this is not setState.
    useEffect(() => {
      visualEditsRef.current = false;
    }, [html]);

    /**
     * Feed the streaming document incrementally.
     *
     * document.write into an about:blank frame rather than re-assigning srcDoc:
     * srcDoc is a full document reload on every update, which makes the Tailwind
     * CDN rescan and the frame strobe several times a second. Incremental writes
     * are exactly what the HTML parser does for a real network stream, so partial
     * tags and a missing </body> are expected input and the page paints
     * progressively with no flashing.
     *
     * Accepted limitation: we never call doc.close(), so readyState stays
     * "loading" and DOMContentLoaded/window.onload never fire in the LIVE
     * preview. Inline scripts still run as their closing tag is parsed, and the
     * committed iframe (branch 2) is unaffected.
     */
    useEffect(() => {
      if (!streamingCode) {
        writtenRef.current = 0;
        return;
      }
      const doc = streamFrameRef.current?.contentDocument;
      if (!doc) return;

      // A snapshot replaced the buffer (reconnect, or a new revision), so the
      // document must be re-parsed from the start.
      if (streamingCode.length < writtenRef.current) writtenRef.current = 0;
      if (writtenRef.current === 0) doc.open();

      const pending = streamingCode.slice(writtenRef.current);
      if (pending) {
        doc.write(pending);
        writtenRef.current = streamingCode.length;
      }
    }, [streamingCode]);

    const handleUpdate = (updates: ElementUpdate) => {
      if (iframeRef.current?.contentWindow) {
        visualEditsRef.current = true;
        iframeRef.current.contentWindow.postMessage(
          {
            type: "UPDATE_ELEMENT",
            payload: updates,
          },
          "*",
        );
      }
    };

    const injectPreview = (source: string) => {
      if (!source) return "";
      if (!showEditorPanel) return source;

      // A hand edit could delete </body>; browsers reparent a trailing script
      // into <body> anyway, so appending still works.
      if (source.includes("</body>")) {
        return source.replace("</body>", iframeScript + "</body>");
      } else {
        return source + iframeScript;
      }
    };

    return (
      <div className="relative h-full flex-1 bg-background  border border-border overflow-hidden">
        {isStreaming ? (
          <>
            <iframe
              ref={streamFrameRef}
              title="Website preview (generating)"
              // No src/srcDoc: the about:blank document is fed incrementally by
              // the effect above. Same sandbox string as the committed preview.
              // Streaming only ever happens in the builder (showEditorPanel), so
              // this resolves to the same-origin variant that makes
              // contentDocument reachable for document.write; withholding
              // allow-top-navigation stops a half-built page from navigating the
              // builder away from itself.
              sandbox={sandbox}
              className={`h-full max-sm:w-full ${resolutions[device] || resolutions.desktop} mx-auto`}
            />
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-card/90 backdrop-blur-xl border border-border text-xs text-muted-foreground shadow-[var(--panel-shadow)]">
              <span className="size-1.5 rounded-full bg-[#7C3AED] animate-pulse" />
              Building your page — {(progress.bytes / 1024).toFixed(1)} KB
            </div>
          </>
        ) : html ? (
          <>
            <iframe
              ref={iframeRef}
              title="Website preview"
              srcDoc={injectPreview(html)}
              // In the builder allow-same-origin is required (getCode() reads
              // contentDocument); for public renders it is dropped so an
              // untrusted published page cannot escape into the app. See the
              // `sandbox` definition above. Withholding allow-top-navigation
              // stops generated pages from navigating the builder away.
              sandbox={sandbox}
              className={`h-full max-sm:w-full ${resolutions[device] || resolutions.desktop} mx-auto transition-all`}
              // Drops a selection pointing at an element from the previous
              // document. An event handler, deliberately: doing this in an
              // effect would trip react-hooks/set-state-in-effect.
              onLoad={() => setSelectedElement(null)}
            />

            {showEditorPanel && selectedElement && (
              <EditorPanel
                selectedElement={selectedElement}
                onUpdate={handleUpdate}
                onClose={clearSelection}
              />
            )}
          </>
        ) : isGenerating ? (
          <LoaderSteps
            phase={progress.phase}
            bytes={progress.bytes}
            connected={progress.connected}
          />
        ) : (
          // Previously rendered nothing at all, so a failed generation left a
          // silent black rectangle with no explanation.
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6">
            <p className="text-foreground font-medium">No preview available</p>
            <p className="text-sm text-muted-foreground">
              Generation didn't produce any code. Your credits were refunded —
              try sending the request again.
            </p>
          </div>
        )}
      </div>
    );
  },
);

export default ProjectPreview;
