import { createContext, ReactNode, useContext, useEffect, useMemo } from "react";
import { useRouter } from "next/router";

import { createNotification } from "@app/components/notifications";
import { useGetUserWorkspaces } from "@app/hooks/api";
import { Workspace } from "@app/hooks/api/workspace/types";

type TWorkspaceContext = {
  workspaces: Workspace[];
  currentWorkspace?: Workspace;
  isLoading: boolean;
};

const WorkspaceContext = createContext<TWorkspaceContext | null>(null);

type Props = {
  children: ReactNode;
};

export const WorkspaceProvider = ({ children }: Props): JSX.Element => {
  const { data: ws, isLoading } = useGetUserWorkspaces();
  const router = useRouter();
  const workspaceId = router.query.id;

  // memorize the workspace details for the context
  const value = useMemo<TWorkspaceContext>(() => {
    const wsId = workspaceId || localStorage.getItem("projectData.id");
    return {
      workspaces: ws || [],
      currentWorkspace: (ws || []).find(({ id }) => id === wsId),
      isLoading
    };
  }, [ws, workspaceId, isLoading]);

  const shouldTriggerNoProjectAccess =
    !value.isLoading &&
    !value.currentWorkspace &&
    router.pathname.startsWith("/project") &&
    workspaceId;

  // handle redirects for project-specific routes
  useEffect(() => {
    if (shouldTriggerNoProjectAccess) {
      createNotification({
        text: "You are not a member of this project.",
        type: "info"
      });

      setTimeout(() => {
        router.push("/");
      }, 5000);
    }
  }, [shouldTriggerNoProjectAccess, router]);

  if (shouldTriggerNoProjectAccess) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bunker-800 text-primary-50">
        You do not have sufficient access to this project.
      </div>
    );
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export const useWorkspace = () => {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace has to be used within <WorkspaceContext.Provider>");
  }

  return ctx;
};
