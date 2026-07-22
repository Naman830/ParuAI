import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2Icon } from "lucide-react";
import ProjectPreview from "../components/projects/ProjectPreview";
import type { Project } from "../types";
import api from "@/configs/axios";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";

const View = () => {
  const { projectId } = useParams();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchCode = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/project/published/${projectId}`);
      setCode(data.code);
    } catch (error) {
      console.log(error);
      toast.error(getErrorMessage(error));
    } finally {
      // Was only cleared on success: an unpublished/missing project left the
      // spinner running forever instead of showing the empty state.
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchCode();
  }, [fetchCode]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2Icon className="animate-spin size-7 text-primary" />
      </div>
    );
  }

  return (
    <div className="h-screen">
      {code ? (
        <ProjectPreview
          project={{ current_code: code } as Project}
          isGenerating={false}
          showEditorPanel={false}
        />
      ) : (
        <div className="flex items-center justify-center h-full text-[#A1A1AA]">
          This project is not available.
        </div>
      )}
    </div>
  );
};

export default View;
