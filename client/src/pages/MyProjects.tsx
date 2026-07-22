import { useState, useEffect, useCallback } from "react";
import type { Project } from "../types";
import { Loader2Icon, PlusIcon, TrashIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "@/configs/axios";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

const MyProjects = () => {
  const { data: session, isPending } = authClient.useSession();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const navigate = useNavigate();

  const fetchProject = useCallback(async () => {
    try {
      const { data } = await api.get("/api/user/projects");
      setProjects(data.projects);
    } catch (error) {
      console.log(error);
      toast.error(getErrorMessage(error));
    } finally {
      // Was only cleared on success → permanent spinner on any failure.
      setLoading(false);
    }
  }, []);

  const deleteProject = async (projectId: string) => {
    try {
      const confirmed = window.confirm(
        "Are u sure you want to delete this project",
      );
      if (!confirmed) return;
      const { data } = await api.delete(`/api/project/${projectId}`);
      toast.success(data.message);
      // WE CAN USE BOTH HERE THIS AND ALSO fetchProject() for deleting project
      setProjects((prev) => prev.filter((p) => p.id !== projectId));
    } catch (error) {
      console.log(error);
      toast.error(getErrorMessage(error));
    }
  };

  useEffect(() => {
    if (isPending) return;

    if (session?.user) {
      fetchProject();
    } else {
      navigate("/");
      toast("Please login to view your project");
    }
  }, [session, isPending, navigate, fetchProject]);

  return (
    <>
      <div className="px-4 md:px-16 lg:px-24 xl:px-32">
        {loading ? (
          <div className="flex items-center justify-center h-[80vh]">
            <Loader2Icon className="animate-spin size-7 text-primary" />
          </div>
        ) : projects.length > 0 ? (
          <div className="py-10 min-h-[80vh]">
            <div>
              {/* HEADING + BUTTON FOR CREATE NEW */}
              <div className="flex justify-between items-center mb-14">
                <h1 className="text-3xl font-semibold tracking-tight text-white">
                  My Projects
                </h1>

                <button
                  onClick={() => navigate("/")}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl 
          bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] 
          hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-indigo-900/30"
                >
                  <PlusIcon size={18} />
                  Create New
                </button>
              </div>

              <div
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                id="project_mobile_view"
              >
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className="relative group w-full h-full flex flex-col cursor-pointer rounded-2xl overflow-hidden bg-[#18181B]/80 backdrop-blur-xl border border-[#27272A] hover:border-[#7C3AED]/50 shadow-lg hover:shadow-[0_0_40px_rgba(124,58,237,0.15)] transition-all duration-300 hover:-translate-y-1
                    "
                  >
                    {/* DESKTOP LIKE MINI PREVIEW */}
                    <div
                      onClick={() => navigate(`/projects/${project.id}`)}
                      className="relative w-full h-40 bg-black overflow-hidden border-b border-[#27272A]"
                    >
                      {project.current_code ? (
                        <iframe
                          srcDoc={project.current_code}
                          className="absolute top-0 left-0 w-[1200px] h-[800px] origin-top-left pointer-events-none"
                          sandbox="allow-scripts allow-same-origin"
                          style={{ transform: "scale(0.25)" }}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-sm text-gray-500">
                          <p>No Preview</p>
                        </div>
                      )}
                    </div>

                    {/* Content */}

                    <div className="p-5 flex flex-col flex-1">
                      {/* Title + Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="text-[18px] font-semibold leading-snug line-clamp-2">
                          {project.name}
                        </h2>

                        <button className="  text-[12px] px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-gray-300">
                          Website
                        </button>
                      </div>

                      {/* Description */}
                      <p className="text-gray-400 mt-2 text-sm leading-relaxed line-clamp-2">
                        {project.initial_prompt}
                      </p>

                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="mt-auto "
                      >
                        <span className="text-[13px] text-gray-500">
                          {new Date(
                            project.createdAt || "",
                          ).toLocaleDateString()}
                          {/* DATE FIXED */}
                        </span>
                      </div>

                      <div className="flex gap-3 text-white text-sm mt-2">
                        <button
                          onClick={() => navigate(`/preview/${project.id}`)}
                          className="flex-1 text-sm px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-[#27272A] transition-all"
                        >
                          Preview
                        </button>

                        <button
                          onClick={() => navigate(`/projects/${project.id}`)}
                          className="flex-1 text-sm px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-[#27272A] transition-all"
                        >
                          Open
                        </button>
                      </div>
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <TrashIcon
                        className="absolute top-3 right-3 scale-0 group-hover:scale-100 bg-[#18181B] border border-[#27272A] p-1.5 size-7 rounded-lg text-red-500  hover:bg-red-500/10 transition-all cursor-pointer"
                        onClick={() => deleteProject(project.id)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-[80vh] text-center">
            <h1 className="text-3xl font-semibold text-gray-300 mb-6">
              You have No Projects Yet!
            </h1>

            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl 
        bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] 
        hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-indigo-900/30"
            >
              <PlusIcon size={18} />
              Create New
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default MyProjects;
