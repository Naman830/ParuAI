import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  BuilderTab,
  CodeDraft,
  CodeSnapshot,
  DeviceType,
  GenerationStatus,
  Project,
  StreamEvent,
  StreamState,
} from "../types";
import type { LucideIcon } from "lucide-react";
import {
  ArrowBigDownDashIcon,
  CodeIcon,
  EyeIcon,
  EyeOffIcon,
  FullscreenIcon,
  LaptopIcon,
  Loader2Icon,
  MessageSquareIcon,
  MonitorIcon,
  SaveIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  TabletIcon,
  XIcon,
} from "lucide-react";

import Sidebar from "../components/projects/Sidebar";
import ProjectPreview, {
  type ProjectPreviewRef,
} from "../components/projects/ProjectPreview";
import AuditPanel, {
  type AuditReport,
} from "../components/projects/AuditPanel";
import api, { API_BASE_URL } from "@/configs/axios";
import { getErrorMessage } from "@/lib/utils";
import { ensureDoctype } from "@/lib/htmlDoc";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

// Module scope, never inside the component: react-hooks/static-components is an
// error, and a per-render lazy() would remount the editor on every render. The
// dynamic import is also what makes Vite emit CodeMirror as a separate chunk —
// it is roughly as large gzipped as the entire rest of the app, so it must only
// load for users who actually open the Code tab.
const CodeEditorPanel = lazy(
  () => import("../components/projects/CodeEditorPanel"),
);

const POLL_INTERVAL_MS = 10000;

const DEVICES = [
  { key: "phone", icon: SmartphoneIcon },
  { key: "tablet", icon: TabletIcon },
  { key: "desktop", icon: LaptopIcon },
] as const satisfies ReadonlyArray<{ key: DeviceType; icon: LucideIcon }>;

const TABS = [
  { key: "preview", icon: MonitorIcon, label: "Preview" },
  { key: "code", icon: CodeIcon, label: "Code" },
] as const satisfies ReadonlyArray<{
  key: BuilderTab;
  icon: LucideIcon;
  label: string;
}>;

/** Matches the marker the server writes when background generation dies. */
const GENERATION_FAILED_MARKER = "[generation-failed]";

const EMPTY_STREAM: StreamState = {
  text: "",
  phase: "queued",
  bytes: 0,
  truncated: false,
  connected: false,
};

const Projects = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const { data: session, isPending } = authClient.useSession();

  // Only covers work the CLIENT started (a revision or rollback). Server-side
  // generation is derived from project.status instead, so a reload mid-generation
  // still shows the right thing.
  const [isClientBusy, setIsClientBusy] = useState(false);
  const [stream, setStream] = useState<StreamState>(EMPTY_STREAM);
  const [device, setDevice] = useState<DeviceType>("desktop");

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [tab, setTab] = useState<BuilderTab>("preview");
  const [draft, setDraft] = useState<CodeDraft | null>(null);
  const [applied, setApplied] = useState<CodeSnapshot | null>(null);

  const [auditOpen, setAuditOpen] = useState(false);
  const [audit, setAudit] = useState<AuditReport | null>(null);
  const [fixPrompt, setFixPrompt] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [isFixing, setIsFixing] = useState(false);

  const previewRef = useRef<ProjectPreviewRef>(null);

  const markerFailed = Boolean(
    project?.conversation?.some((m) =>
      m.content?.includes(GENERATION_FAILED_MARKER),
    ),
  );

  // Deploy-order safety net: a freshly deployed client can briefly talk to an
  // API that predates the status column, so fall back to the legacy signals and
  // the UI still terminates.
  const status: GenerationStatus =
    project?.status ??
    (project?.current_code ? "ready" : markerFailed ? "failed" : "pending");

  const isServerBusy = status === "pending" || status === "generating";
  const isGenerating = isServerBusy || isClientBusy || isFixing;

  // Derived during render — pure, no effects. `basedOn` is what makes a local
  // draft self-invalidate the moment an AI revision, rollback or save changes
  // current_code, which matters because react-hooks/set-state-in-effect forbids
  // the obvious "effect watches current_code and resets" implementation.
  const baseCode = project?.current_code ?? null;
  const freshDraft = draft && draft.basedOn === baseCode ? draft : null;
  const freshApplied = applied && applied.basedOn === baseCode ? applied : null;
  const isDraftStale = draft !== null && draft.basedOn !== baseCode;
  const isCodeDirty = freshDraft !== null && freshDraft.html !== freshDraft.pristine;
  const previewSource = freshApplied?.html ?? baseCode;

  const fetchProject = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/user/project/${projectId}`);
      setProject(data.project as Project);
    } catch (error) {
      toast.error(getErrorMessage(error));
      console.log(error);
    } finally {
      // Was only cleared on success → a failed first load spun the spinner
      // forever instead of showing the "Unable to load project" state.
      setLoading(false);
    }
  }, [projectId]);

  /**
   * The single place that decides which surface is authoritative.
   *
   * Only ever called from event handlers — reading previewRef.current during
   * render is a react-hooks/refs error.
   */
  const collectAuthoritativeCode = (): string | undefined => {
    if (tab === "code" && freshDraft) return ensureDoctype(freshDraft.html);
    const pulled = previewRef.current?.getCode();
    if (pulled) return pulled;
    return previewSource ?? undefined;
  };

  const openCodeTab = () => {
    // Never clobber text the user has typed.
    if (!isCodeDirty) {
      const seed = previewRef.current?.hasVisualEdits()
        ? previewRef.current?.getCode()
        : previewSource;
      const text = seed ?? previewSource ?? "";
      setDraft({ basedOn: baseCode, pristine: text, html: text });
    }
    previewRef.current?.clearSelection();
    setTab("code");
  };

  const openPreviewTab = () => {
    // Only touch `applied` when there is something new to apply: leaving srcDoc
    // byte-identical is what stops the iframe reloading and discarding unsaved
    // in-DOM visual edits.
    if (isCodeDirty && freshDraft) {
      setApplied({ basedOn: baseCode, html: ensureDoctype(freshDraft.html) });
    }
    previewRef.current?.clearSelection();
    setTab("preview");
  };

  const saveProject = async () => {
    const code = collectAuthoritativeCode();
    if (!code) return;
    setIsSaving(true);
    try {
      const { data } = await api.put(`/api/project/save/${projectId}`, {
        code,
      });
      toast.success(data.message);
      setDraft(null);
      setApplied(null);
      // The save creates a new Version server-side; refresh so the sidebar
      // shows it and "Current Version" stays accurate.
      await fetchProject();
    } catch (error) {
      toast.error(getErrorMessage(error));
      console.log(error);
    } finally {
      setIsSaving(false);
    }
  };

  // Download Code ( index.html )
  const downloadCode = () => {
    const code = collectAuthoritativeCode();
    if (!code) {
      toast.error(
        isServerBusy
          ? "Your website is still generating"
          : "There is no code to download yet",
      );
      return;
    }
    const element = document.createElement("a");
    const url = URL.createObjectURL(new Blob([code], { type: "text/html" }));
    element.href = url;
    element.download = "index.html";
    document.body.appendChild(element);
    element.click();
    // The anchor and the blob URL used to be leaked on every download.
    document.body.removeChild(element);
    URL.revokeObjectURL(url);
  };

  const togglePublish = async () => {
    try {
      const { data } = await api.get(`/api/user/publish-toggle/${projectId}`);
      toast.success(data.message);
      // Trust the server's value rather than blind-flipping local state, which
      // desynced whenever the request was rejected but still resolved.
      setProject((prev) =>
        prev ? { ...prev, isPublished: data.isPublished } : null,
      );
    } catch (error) {
      toast.error(getErrorMessage(error));
      console.log(error);
    }
  };

  const runAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      const { data } = await api.get(`/api/project/audit/${projectId}`);
      setAudit(data.report as AuditReport);
      setFixPrompt(data.fixPrompt as string | null);
    } catch (error) {
      toast.error(getErrorMessage(error));
      console.log(error);
    } finally {
      setAuditLoading(false);
    }
  }, [projectId]);

  const openAudit = () => {
    setAuditOpen(true);
    if (!audit) void runAudit();
  };

  /**
   * Reuses the existing revision endpoint rather than adding a second AI path,
   * so the charge-up-front / refund-on-failure credit logic stays in one place.
   * `enhance: false` is load-bearing: the revision enhancer is told to return
   * "1-2 sentences" and would compress the whole fix list into one vague line.
   */
  const fixWithAi = async () => {
    if (!fixPrompt) return;
    setIsFixing(true);
    try {
      const { data } = await api.post(`/api/project/revision/${projectId}`, {
        message: fixPrompt,
        enhance: false,
      });
      toast.success(data.message);
      await fetchProject();
      await runAudit();
    } catch (error) {
      toast.error(getErrorMessage(error));
      console.log(error);
      // Pull in whatever the server did manage to write (e.g. the refund notice).
      await fetchProject();
    } finally {
      setIsFixing(false);
    }
  };

  useEffect(() => {
    if (isPending) return;

    if (session?.user) {
      fetchProject();
    } else {
      navigate("/");
      toast("Please login to view your projects");
    }
  }, [session?.user, isPending, navigate, fetchProject]);

  useEffect(() => {
    // Keyed off the derived status rather than isGenerating, so a revision or
    // rollback does not also start a redundant project poll. Kept even while SSE
    // is connected: the poll is what keeps a free Render instance from spinning
    // down mid-generation, and current_code is null meanwhile so it is cheap.
    if (!project?.id) return;
    if (status !== "pending" && status !== "generating") return;

    const intervalId = setInterval(fetchProject, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [project?.id, status, fetchProject]);

  /**
   * One subscription covers both the initial generation and revisions, because
   * both publish to the same server-side channel — which is why Sidebar.tsx
   * needs no streaming code at all.
   */
  useEffect(() => {
    if (!projectId || !isServerBusy) return;
    if (typeof EventSource === "undefined") return;

    // API_BASE_URL, never import.meta.env directly: authClient and axios share
    // that constant and the stream must not drift onto a different origin.
    const es = new EventSource(
      `${API_BASE_URL}/api/user/project/${projectId}/stream`,
      { withCredentials: true },
    );

    es.onopen = () => setStream((s) => ({ ...s, connected: true }));

    es.onmessage = (ev: MessageEvent<string>) => {
      const event: StreamEvent = JSON.parse(ev.data);
      switch (event.type) {
        case "snapshot":
          // Replace, never append: a reconnect or a new revision resends the
          // whole buffer from offset 0.
          setStream({
            text: event.text,
            phase: event.phase,
            bytes: event.bytes,
            truncated: event.truncated,
            connected: true,
          });
          break;
        case "delta":
          setStream((s) => ({
            ...s,
            text: s.text + event.text,
            bytes: event.bytes,
            truncated: event.truncated,
          }));
          break;
        case "status":
          setStream((s) => ({ ...s, phase: event.phase, bytes: event.bytes }));
          break;
        case "done":
        case "failed":
          // Both mandatory: without close() the browser reconnects forever, and
          // without clearing the stream the read-only streaming frame keeps
          // covering the editable one.
          es.close();
          setStream(EMPTY_STREAM);
          void fetchProject();
          break;
      }
    };

    es.onerror = () => {
      // EventSource never exposes the HTTP status. Any failure just means we
      // fall back to the 10s poll; the browser only auto-retries transport
      // errors, so a 401/404/503 stops here on its own.
      setStream((s) => ({ ...s, connected: false }));
    };

    return () => es.close();
  }, [projectId, isServerBusy, fetchProject]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <Loader2Icon className="animate-spin size-7 text-primary" />
      </div>
    );
  }

  return project ? (
    <div className="flex flex-col h-screen w-full bg-background text-foreground">
      {/* Builder Navbar */}
      <div className="flex max-sm:flex-col sm:items-center gap-4 px-4 py-3 border-b border-border bg-background/80 backdrop-blur-xl">
        {/* Left */}
        <div className="flex items-center gap-3 sm:min-w-[280px]">
          <img
            src="/favicon.svg"
            alt="logo"
            className="h-6 cursor-pointer"
            onClick={() => navigate("/")}
          />

          <div className="max-w-56">
            <p className="text-sm font-medium truncate">{project.name}</p>
            <p className="text-xs text-muted-foreground">
              {isCodeDirty ? "Unsaved code changes" : "Previewing last save version"}
            </p>
          </div>

          <div className="sm:hidden flex-1 flex justify-end">
            {isMenuOpen ? (
              <XIcon
                onClick={() => setIsMenuOpen(false)}
                className="size-6 cursor-pointer text-muted-foreground"
              />
            ) : (
              <MessageSquareIcon
                onClick={() => setIsMenuOpen(true)}
                className="size-6 cursor-pointer text-muted-foreground"
              />
            )}
          </div>
        </div>
        {/* middle */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-card border border-border">
            {TABS.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={key === "code" ? openCodeTab : openPreviewTab}
                disabled={key === "code" && !project.current_code}
                className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs transition disabled:opacity-40 ${
                  tab === key
                    ? "bg-[#7C3AED] text-white"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <Icon className="size-4" />
                <span className="hidden sm:inline">{label}</span>
                {key === "code" && isCodeDirty && (
                  <span className="size-1.5 rounded-full bg-amber-500" />
                )}
              </button>
            ))}
          </div>

          <div className="hidden sm:flex items-center gap-1 p-1 rounded-xl bg-card border border-border">
            {DEVICES.map(({ key, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setDevice(key)}
                className={`p-2 rounded-lg transition ${
                  device === key
                    ? "bg-[#7C3AED] text-white"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <Icon className="size-4" />
              </button>
            ))}
          </div>
        </div>
        {/* right */}
        <div className="flex items-center justify-end gap-2 flex-1 text-xs sm:text-sm">
          <button
            onClick={openAudit}
            disabled={!project.current_code}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border hover:border-[#7C3AED] transition disabled:opacity-40"
          >
            <ShieldCheckIcon size={16} />
            {audit ? `Audit ${audit.score}` : "Audit"}
          </button>
          <button
            onClick={saveProject}
            disabled={isSaving || !project.current_code}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border hover:border-[#7C3AED] transition disabled:opacity-40"
          >
            {isSaving ? (
              <Loader2Icon className="animate-spin" size={16} />
            ) : (
              <SaveIcon size={16} />
            )}
            Save
          </button>
          <Link
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border hover:border-[#7C3AED] transition"
            target="_blank"
            to={`/preview/${project.id}`}
          >
            <FullscreenIcon size={16} />
            Preview
          </Link>
          <button
            onClick={downloadCode}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#7C3AED] to-[#4F46E5] hover:opacity-90 transition"
          >
            <ArrowBigDownDashIcon size={16} /> Download
          </button>
          <button
            onClick={togglePublish}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border hover:border-[#7C3AED] transition"
          >
            {project.isPublished ? (
              <EyeOffIcon size={16} />
            ) : (
              <EyeIcon size={16} />
            )}
            {project.isPublished ? "Unpublish" : "Publish"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          isMenuOpen={isMenuOpen}
          project={project}
          setProject={(p) => setProject(p)}
          isGenerating={isGenerating}
          setIsGenerating={setIsClientBusy}
        />

        {/*
          This wrapper must NEVER unmount and must NEVER be reparented: either
          reloads the iframe and destroys every unsaved visual edit. Only its
          className changes when switching tabs — display:none preserves the
          iframe's document.
        */}
        <div
          className={`flex-1 p-2 pl-0 min-w-0 ${tab === "code" ? "hidden" : ""}`}
        >
          <ProjectPreview
            ref={previewRef}
            project={project}
            isGenerating={isGenerating}
            device={device}
            sourceCode={previewSource}
            streamingCode={stream.text}
            streamProgress={stream}
          />
        </div>

        {/*
          Appended AFTER the preview wrapper so React never touches the earlier
          child when this mounts. Mounted/unmounted rather than hidden on
          purpose: CodeMirror measures its container on mount, and mounting
          inside a display:none box yields a 0x0 measurement and a collapsed
          editor. The cost is that undo history resets per tab switch; the text
          itself lives in `draft`.
        */}
        {tab === "code" && (
          <div className="flex-1 p-2 pl-0 min-w-0">
            <Suspense
              fallback={
                <div className="h-full grid place-items-center">
                  <Loader2Icon className="animate-spin size-6 text-primary" />
                </div>
              }
            >
              <CodeEditorPanel
                value={freshDraft?.html ?? previewSource ?? ""}
                onChange={(value) =>
                  setDraft((prev) => ({
                    basedOn: baseCode,
                    pristine: prev?.basedOn === baseCode ? prev.pristine : value,
                    html: value,
                  }))
                }
                onSave={saveProject}
                isDirty={isCodeDirty}
                isSaving={isSaving}
                isStale={isDraftStale}
                onReloadFromProject={() => {
                  const text = baseCode ?? "";
                  setDraft({ basedOn: baseCode, pristine: text, html: text });
                }}
                onRefreshFromPreview={() => {
                  const pulled = previewRef.current?.getCode() ?? previewSource ?? "";
                  setDraft({
                    basedOn: baseCode,
                    pristine: pulled,
                    html: pulled,
                  });
                }}
              />
            </Suspense>
          </div>
        )}

        {/*
          A flex SIBLING, not an overlay: it resizes the iframe (which does not
          reload it) instead of covering it, and so cannot collide with
          EditorPanel's absolute top-4 right-4 positioning.
        */}
        {auditOpen && (
          <AuditPanel
            report={audit}
            fixPrompt={fixPrompt}
            isLoading={auditLoading}
            isFixing={isFixing}
            hasUnsavedEdits={isCodeDirty}
            onRunAudit={runAudit}
            onFixWithAi={fixWithAi}
            onClose={() => setAuditOpen(false)}
          />
        )}
      </div>
    </div>
  ) : (
    <div className="flex flex-col items-center justify-center h-[80vh] bg-background">
      <h1 className="text-2xl font-semibold text-muted-foreground">
        Unable to load project
      </h1>
    </div>
  );
};

export default Projects;
