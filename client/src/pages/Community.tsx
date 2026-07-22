import { useState, useEffect, useCallback } from "react";
import type { Project } from "../types";
import { Loader2Icon, PlusIcon } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import api from "@/configs/axios";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import { motion } from "motion/react";

const Community = () => {
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const navigate = useNavigate();

  const fetchProject = useCallback(async () => {
    try {
      const { data } = await api.get("/api/project/published");
      setProjects(data.projects);
    } catch (error) {
      console.log(error);
      toast.error(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  return (
    <>
      <div className="min-h-screen flex flex-col relative">
        <div className="flex-grow pt-32 pb-20 relative px-6">
          <div className="absolute top-0 left-0 w-full h-screen grid-bg pointer-events-none -z-10 opacity-40"></div>
          <div className="absolute top-20 left-1/2 -translate-x-1/2 w-full h-full bg-primary/10 rounded-full blur-[120px] pointer-events-none -z-10"></div>

          {loading ? (
            <div className="flex items-center justify-center h-[80vh]">
              <Loader2Icon className="animate-spin size-7 text-primary" />
            </div>
          ) : projects.length > 0 ? (
            <div className="max-w-[1400px] mx-auto">
              <div>
                <div className="text-center mb-16 relative">
                  <motion.h1
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-4xl md:text-5xl font-bold text-white mb-4 glow-text tracking-tight"
                  >
                    Explore the Community
                  </motion.h1>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="text-text-secondary text-lg max-w-2xl mx-auto"
                  >
                    Be inspired by the best websites built with ParuAI. Clone,
                    remix, and learn from top creators.
                  </motion.p>
                </div>
                <div
                  className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6"
                  id="project_mobile_view"
                >
                  {projects.map((project) => (
                    <Link
                      key={project.id}
                      to={`/view/${project.id}`}
                      target="_blank"
                      className="w-full cursor-pointer bg-[#18181B]/80 backdrop-blur-xl border border-[#27272A] rounded-2xl overflow-hidden group relative transition-all duration-300 hover:-translate-y-1.5 hover:border-[#7C3AED]/60"
                    >
                      {/* DESKTOP LIKE MINI PREVIEW */}

                      <div
                        // onClick={() => navigate(`/projects/${project.id}`)} //This is create erorr while view and then come it show project page which is not exist in user
                        className=" relative w-full h-40 overflow-hidden border-b border-[#27272A] bg-black"
                      >
                        {project.current_code ? (
                          <iframe
                            srcDoc={project.current_code}
                            className="absolute top-0 left-0 w-[1200px] h-[800px] origin-top-left pointer-events-none"
                            sandbox="allow-scripts allow-same-origin"
                            style={{ transform: "scale(0.25)" }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-sm text-gray-500">
                            <p>No Preview</p>
                          </div>
                        )}
                      </div>

                      {/* Content */}

                      <div className="p-4 text-white">
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

                        <div className="flex justify-between items-center mt-5">
                          <span className="text-[13px] text-gray-500">
                            {project.createdAt &&
                              new Date(project.createdAt).toLocaleDateString()}
                            {/* DATE FIXED */}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mt-3">
                          <div className="size-7 rounded-full bg-gradient-to-br from-[#7C3AED] to-[#4F46E5] flex items-center justify-center text-xs font-semibold">
                            {project.user?.name?.slice(0, 1) || "U"}
                          </div>

                          <span className="text-xs text-gray-300 truncate">
                            {project.user?.name}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex flex-col items-center justify-center h-[80vh]">
                <h1 className="text-3xl font-semibold text-gray-300">
                  No projects published yet
                </h1>
                <div className="flex justify-center items-center">
                  <button
                    onClick={() => navigate("/")}
                    className="flex items-center gap-2 text-white px-3 sm:px-6 py-1 sm:py-2 rounded bg-linear-to-br from-indigo-500 to-indigo-600 hover:opacity-90 active:scale-95
              transition-all"
                  >
                    <PlusIcon size={18} />
                    Create New
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default Community;
