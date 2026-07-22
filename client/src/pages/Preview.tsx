import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2Icon } from "lucide-react";
import ProjectPreview from "../components/projects/ProjectPreview";
import type { Project } from "../types";
import api from "@/configs/axios";
import { getErrorMessage } from "@/lib/utils";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";

const Preview = () => {
  const { data: session, isPending } = authClient.useSession();

  // Route is /preview/:projectId/:version — this used to destructure
  // `versionId`, which was always undefined, so version preview never worked.
  const { projectId, version } = useParams();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchCode = useCallback(async () => {
    try {
      const { data } = await api.get(`/api/project/preview/${projectId}`, {
        // The server resolves the version and returns just that snapshot.
        params: version ? { versionId: version } : undefined,
      });
      setCode(data.code || "");
    } catch (error) {
      toast.error(getErrorMessage(error));
      console.log(error);
    } finally {
      // Was only cleared on success, leaving a permanent spinner on any error.
      setLoading(false);
    }
  }, [projectId, version]);

  useEffect(() => {
    if (isPending) return;

    if (!session?.user) {
      setLoading(false);
      toast.error("Please login to preview this project");
      return;
    }

    fetchCode();
  }, [session?.user, isPending, fetchCode]);

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
          Nothing to preview.
        </div>
      )}
    </div>
  );
};

export default Preview;
