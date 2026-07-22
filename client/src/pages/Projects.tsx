import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { DeviceType, Project } from "../types";
import type { LucideIcon } from "lucide-react";
import {
  ArrowBigDownDashIcon,
  EyeIcon,
  EyeOffIcon,
  FullscreenIcon,
  LaptopIcon,
  Loader2Icon,
  MessageSquareIcon,
  SaveIcon,
  SmartphoneIcon,
  TabletIcon,
  XIcon,
} from "lucide-react";

import Sidebar from "../components/projects/Sidebar";
import ProjectPreview, {
  type ProjectPreviewRef,
} from "../components/projects/ProjectPreview";
import api from "@/configs/axios";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

const POLL_INTERVAL_MS = 10000;

const DEVICES = [
  { key: "phone", icon: SmartphoneIcon },
  { key: "tablet", icon: TabletIcon },
  { key: "desktop", icon: LaptopIcon },
] as const satisfies ReadonlyArray<{ key: DeviceType; icon: LucideIcon }>;
/** Matches the marker the server writes when background generation dies. */
const GENERATION_FAILED_MARKER = "[generation-failed]";

const Projects = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  const { data: session, isPending } = authClient.useSession();

  const [isGenerating, setIsGenerating] = useState(true);
  const [device, setDevice] = useState<DeviceType>("desktop");

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const previewRef = useRef<ProjectPreviewRef>(null);

  const fetchProject = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/user/project/${projectId}`);
      const fetched: Project = data.project;
      setProject(fetched);

      // Background generation can fail; the server records it as an assistant
      // message. Without this the spinner and the 10s poll ran forever.
      const failed = fetched.conversation?.some((m) =>
        m.content?.includes(GENERATION_FAILED_MARKER),
      );
      setIsGenerating(!fetched.current_code && !failed);
    } catch (error) {
      toast.error(getErrorMessage(error));
      console.log(error);
    } finally {
      // Was only cleared on success → a failed first load span the spinner
      // forever instead of showing the "Unable to load project" state.
      setLoading(false);
    }
  }, [projectId]);

  const saveProject = async () => {
    if (!previewRef.current) return;
    const code = previewRef.current.getCode();
    if (!code) return;
    setIsSaving(true);
    try {
      const { data } = await api.put(`/api/project/save/${projectId}`, {
        code,
      });
      toast.success(data.message);
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
    const code = previewRef.current?.getCode() || project?.current_code;
    if (!code) {
      toast.error(
        isGenerating
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
    // Poll only while a generation is actually in flight — stops on success
    // and on the failure marker instead of hammering the API forever.
    if (!project?.id || project.current_code || !isGenerating) return;

    const intervalId = setInterval(fetchProject, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [project?.id, project?.current_code, isGenerating, fetchProject]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <Loader2Icon className="animate-spin size-7 text-primary" />
      </div>
    );
  }

  return project ? (
    <div className="flex flex-col h-screen w-full bg-[#09090B] text-white">
      {/* Builder Navbar */}
      <div className="flex max-sm:flex-col sm:items-center gap-4 px-4 py-3 border-b border-[#27272A] bg-[#09090B]/80 backdrop-blur-xl">
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
            <p className="text-xs text-[#71717A]">
              Previewing last save version
            </p>
          </div>

          <div className="sm:hidden flex-1 flex justify-end">
            {isMenuOpen ? (
              <XIcon
                onClick={() => setIsMenuOpen(false)}
                className="size-6 cursor-pointer text-[#A1A1AA]"
              />
            ) : (
              <MessageSquareIcon
                onClick={() => setIsMenuOpen(true)}
                className="size-6 cursor-pointer text-[#A1A1AA]"
              />
            )}
          </div>
        </div>
        {/* middle */}
        <div className="hidden sm:flex items-center gap-1 p-1 rounded-xl bg-[#18181B] border border-[#27272A]">
          {DEVICES.map(({ key, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setDevice(key)}
              className={`p-2 rounded-lg transition ${
                device === key
                  ? "bg-[#7C3AED] text-white"
                  : "text-[#A1A1AA] hover:bg-[#27272A]"
              }`}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
        {/* right */}
        <div className="flex items-center justify-end gap-2 flex-1 text-xs sm:text-sm">
          <button
            onClick={saveProject}
            disabled={isSaving}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#18181B] border border-[#27272A] hover:border-[#7C3AED] transition"
          >
            {isSaving ? (
              <Loader2Icon className="animate-spin" size={16} />
            ) : (
              <SaveIcon size={16} />
            )}
            Save
          </button>
          <Link
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#18181B] border border-[#27272A] hover:border-[#7C3AED] transition"
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
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#18181B] border border-[#27272A] hover:border-[#7C3AED] transition"
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
          setIsGenerating={setIsGenerating}
        />

        <div className="flex-1 p-2 pl-0 ">
          <ProjectPreview
            ref={previewRef}
            project={project}
            isGenerating={isGenerating}
            device={device}
          />
        </div>
      </div>
    </div>
  ) : (
    <div className="flex flex-col items-center justify-center h-[80vh] bg-[#09090B]">
      <h1 className="text-2xl font-semibold text-[#A1A1AA]">
        Unable to load project
      </h1>
    </div>
  );
};

export default Projects;
