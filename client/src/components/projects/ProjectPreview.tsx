import { forwardRef, useImperativeHandle, useRef, useState, useEffect } from "react";
import type {
  DeviceType,
  ElementUpdate,
  Project,
  SelectedElement,
} from "../../types";
import { iframeScript } from "../../assets/assets";
import EditorPanel from "./EditorPanel";
import LoaderSteps from "./LoaderSteps";

interface ProjectPreviewProps {
  project: Project;
  isGenerating: boolean;
  device?: DeviceType;
  showEditorPanel?: boolean;
}

export interface ProjectPreviewRef {
  getCode: () => string | undefined;
}

const ProjectPreview = forwardRef<ProjectPreviewRef, ProjectPreviewProps>(
  (
    { project, device = "desktop", isGenerating, showEditorPanel = true },
    ref,
  ) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [selectedElement, setSelectedElement] =
      useState<SelectedElement | null>(null);

    const resolutions = {
      phone: "w-[412px]",
      tablet: "w-[768px]",
      desktop: "w-full",
    };

    useImperativeHandle(ref, () => ({
      getCode: () => {
        const doc = iframeRef.current?.contentDocument;
        if (!doc) return undefined;

        // 1. Remove our selection class / attributes / outline from all elements

        doc
          .querySelectorAll(".ai-selected-element, [data-ai-selected]")
          .forEach((el) => {
            el.classList.remove("ai-selected-element");
            el.removeAttribute("data-ai-selected");
            (el as HTMLElement).style.outline = "";
          });

        // 2. Remove injected style + script from the document
        const previewStyle = doc.getElementById("ai-preview-style");
        if (previewStyle) previewStyle.remove();

        const previewScript = doc.getElementById("ai-preview-script");
        if (previewScript) previewScript.remove();

        // 3. Serialize clean Html
        const html = doc.documentElement.outerHTML;
        return html;
      },
    }));

    useEffect(() => {
      const handleMessage = (event: MessageEvent) => {
        // The preview runs arbitrary generated JS, and any page can postMessage
        // here — only accept messages from our own iframe.
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

    const handleUpdate = (updates: ElementUpdate) => {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          {
            type: "UPDATE_ELEMENT",
            payload: updates,
          },
          "*",
        );
      }
    };

    const injectPreview = (html: string) => {
      if (!html) return "";
      if (!showEditorPanel) return html;

      if (html.includes("</body>")) {
        return html.replace("</body>", iframeScript + "</body>");
      } else {
        return html + iframeScript;
      }
    };

    return (
      <div className="relative h-full flex-1 bg-[#09090B]  border border-[#27272A] overflow-hidden">
        {project.current_code ? (
          <>
            <iframe
              ref={iframeRef}
              title="Website preview"
              srcDoc={injectPreview(project.current_code)}
              // allow-same-origin is required: getCode() reads contentDocument.
              // Withholding allow-top-navigation stops generated pages from
              // navigating the builder away from itself.
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
              className={`h-full max-sm:w-full ${resolutions[device] || resolutions.desktop} mx-auto transition-all`}
            />

            {showEditorPanel && selectedElement && (
              <EditorPanel
                selectedElement={selectedElement}
                onUpdate={handleUpdate}
                onClose={() => {
                  setSelectedElement(null);
                  if (iframeRef.current?.contentWindow) {
                    iframeRef.current.contentWindow.postMessage(
                      { type: "CLEAR_SELECTION_REQUEST" },
                      "*",
                    );
                  }
                }}
              />
            )}
          </>
        ) : isGenerating ? (
          <LoaderSteps />
        ) : (
          // Previously rendered nothing at all, so a failed generation left a
          // silent black rectangle with no explanation.
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6">
            <p className="text-[#FAFAFA] font-medium">No preview available</p>
            <p className="text-sm text-[#71717A]">
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
