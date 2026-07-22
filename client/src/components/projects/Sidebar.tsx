import api from "@/configs/axios";
import { getErrorMessage } from "@/lib/utils";
import type { Message, Project, Version } from "../../types";
import {
  BotIcon,
  EyeIcon,
  Loader2Icon,
  SendIcon,
  UserIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

interface SidebarProps {
  isMenuOpen: boolean;
  project: Project;
  setProject: (project: Project) => void;
  isGenerating: boolean;
  setIsGenerating: (isGenerating: boolean) => void;
}

const POLL_INTERVAL_MS = 10000;

const Sidebar = ({
  isMenuOpen,
  project,
  setProject,
  isGenerating,
  setIsGenerating,
}: SidebarProps) => {
  const messageRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [input, setInput] = useState("");

  const projectId = project.id;

  const fetchProject = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/user/project/${projectId}`);
      setProject(data.project);
    } catch (error) {
      toast.error(getErrorMessage(error));
      console.log(error);
    }
  }, [projectId, setProject]);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // The revision request can outlive this component (navigating away mid-run
  // used to leave the interval firing against an unmounted tree).
  useEffect(() => stopPolling, [stopPolling]);

  const handleRollback = async (versionId: string) => {
    try {
      const confirmed = window.confirm(
        "Are you sure you want to rollback to this version?",
      );
      if (!confirmed) return;
      setIsGenerating(true);

      const { data } = await api.get(
        `/api/project/rollback/${projectId}/${versionId}`,
      );
      toast.success(data.message);
      await fetchProject();
    } catch (error) {
      toast.error(getErrorMessage(error));
      console.log(error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRevisions = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isGenerating) return;

    try {
      setIsGenerating(true);
      stopPolling();
      // Surface the assistant's intermediate messages while the server works.
      pollRef.current = setInterval(fetchProject, POLL_INTERVAL_MS);

      const { data } = await api.post(`/api/project/revision/${projectId}`, {
        message: input,
      });
      setInput("");
      toast.success(data.message);
      await fetchProject();
    } catch (error) {
      toast.error(getErrorMessage(error));
      console.log(error);
      // Pull in whatever the server did manage to write (e.g. the refund notice).
      await fetchProject();
    } finally {
      stopPolling();
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (messageRef.current) {
      messageRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [project.conversation.length, isGenerating]);

  return (
    <div
      // Was inverted: opening the chat on mobile collapsed it to w-0.
      className={`h-full sm:max-w-sm  bg-[#09090B] border border-[#27272A] shadow-[0_0_40px_rgba(124,58,237,0.08)] transition-all ${isMenuOpen ? "w-full" : "max-sm:w-0 max-sm:overflow-hidden sm:w-full"}`}
    >
      <div className="flex flex-col h-full">
        {/* Message Container*/}
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 flex flex-col gap-5">
          {[...project.conversation, ...project.versions]
            .sort(
              (a, b) =>
                new Date(a.timestamp).getTime() -
                new Date(b.timestamp).getTime(),
            )
            .map((message) => {
              const isMessage = "content" in message;

              if (isMessage) {
                const msg = message as Message;
                const isUser = msg.role === "user";
                return (
                  <div
                    key={msg.id}
                    // The ternary used to sit *inside* the template string, so
                    // user messages never right-aligned and the literal text
                    // `? "justify-end" : "justify-start"` leaked into the class.
                    className={`flex items-end gap-3 ${isUser ? "justify-end" : "justify-start"}`}
                  >
                    {!isUser && (
                      <div className="w-8 h-8 rounded-xl bg-[#18181B] border border-[#27272A] flex items-center justify-center shadow shrink-0">
                        <BotIcon className="size-4 text-[#A1A1AA]" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] px-4 py-2.5 text-sm leading-relaxed rounded-2xl transition-all whitespace-pre-wrap break-words ${isUser ? "bg-gradient-to-r from-[#7C3AED] to-[#4F46E5] text-white rounded-br-none " : "bg-[#18181B] border border-[#27272A] text-[#E4E4E7] rounded-bl-none"}`}
                    >
                      {msg.content}
                    </div>
                    {isUser && (
                      <div className="w-8 h-8 rounded-xl bg-[#18181B] border border-[#27272A] flex items-center justify-center shrink-0">
                        <UserIcon className="size-4 text-[#A1A1AA]" />
                      </div>
                    )}
                  </div>
                );
              } else {
                const ver = message as Version;
                return (
                  <div
                    key={ver.id}
                    className="w-[90%] mx-auto p-4 rounded-2xl bg-[#18181B] border border-[#27272A] shadow-sm flex flex-col gap-3 hover:border-[#7C3AED]/40 transition-all "
                  >
                    <div className="text-xs text-[#A1A1AA]">
                      code updated <br />{" "}
                      <span className="text-white font-medium">
                        {new Date(ver.timestamp).toLocaleString()}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      {project.current_version_index === ver.id ? (
                        <button className="px-3 py-1 text-xs rounded-md bg-[#27272A] text-[#A1A1AA]">
                          Current Version
                        </button>
                      ) : (
                        <button
                          onClick={() => handleRollback(ver.id)}
                          disabled={isGenerating}
                          className="px-3 py-1 text-xs rounded-md bg-gradient-to-r from-[#7C3AED] to-[#4F46E5] text-white hover:opacity-90 disabled:opacity-50 transition"
                        >
                          Roll Back to this Version
                        </button>
                      )}
                      {/* Was a double-quoted string, so this navigated to the
                          literal path "/preview/${project.id}/${ver.id}". */}
                      <Link
                        target="_blank"
                        rel="noopener noreferrer"
                        to={`/preview/${project.id}/${ver.id}`}
                      >
                        <EyeIcon className="size-7 p-1.5 rounded-lg bg-[#27272A] hover:bg-[#7C3AED] transition" />
                      </Link>
                    </div>
                  </div>
                );
              }
            })}

          {isGenerating && (
            <div className="flex items-center gap-3 justify-start">
              <div className="w-8 h-8 rounded-full bg-linear-to-br from-indigo-600 to-indigo-700 flex items-center justify-center">
                <BotIcon className="size-5 text-white" />
              </div>
              {/* Three dots loader */}
              <div className="flex gap-1.5">
                <span
                  className="size-2 rounded-full bg-[#7C3AED] animate-bounce "
                  style={{ animationDelay: "0s" }}
                />
                <span
                  className="size-2 rounded-full bg-[#7C3AED] animate-bounce "
                  style={{ animationDelay: "0.2s" }}
                />
                <span
                  className="size-2 rounded-full bg-[#7C3AED] animate-bounce"
                  style={{ animationDelay: "0.4s" }}
                />
              </div>
            </div>
          )}
          <div ref={messageRef} />
        </div>
        {/* INPUT FIELD CONTAINER*/}
        <form
          onSubmit={handleRevisions}
          className="p-3 border-t border-[#27272A] bg-[#09090B]"
        >
          <div className="relative">
            <textarea
              onChange={(e) => setInput(e.target.value)}
              value={input}
              rows={4}
              placeholder="Decribe your website or request changes..."
              className="w-full p-4 pr-12 rounded-2xl resize-none text-sm outline-none bg-[#18181B] border border-[#27272A] text-white placeholder-[#71717A] focus:border-[#7C3AED] focus:ring-1 focus:ring-[#7C3AED] transition-all"
              disabled={isGenerating}
            />

            <button
              type="submit"
              disabled={isGenerating || !input.trim()}
              className="absolute bottom-3 right-3 p-2 rounded-xl bg-gradient-to-r from-[#7C3AED] to-[#4F46E5] hover:opacity-90 disabled:opacity-50 transition"
            >
              {isGenerating ? (
                <Loader2Icon className="size-7 p-1.5 animate-spin text-white " />
              ) : (
                <SendIcon className="size-7 p-1.5 text-white" />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Sidebar;
