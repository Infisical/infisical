import { createContext, ReactNode, useContext } from "react";

import { useGetUserProjectPermissions } from "@app/hooks/api";

import { useWorkspace } from "../WorkspaceContext";
import { TProjectPermission } from "./types";

type Props = {
  children: ReactNode;
};

const ProjectPermissionContext = createContext<null | TProjectPermission>(null);

export const ProjectPermissionProvider = ({ children }: Props): JSX.Element => {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?._id || "";
  const { data: permission, isLoading } = useGetUserProjectPermissions({ workspaceId });

  if (isLoading && workspaceId) {
    return (
      <div className="flex items-center justify-center w-screen h-screen bg-bunker-800">
        <img
          src="/images/loading/loading.gif"
          height={70}
          width={120}
          alt="infisical loading indicator"
        />
      </div>
    );
  }

  if (!permission && currentWorkspace) {
    return (
      <div className="flex items-center justify-center w-screen h-screen bg-bunker-800">
        Failed to load user permissions
      </div>
    );
  }

  if (!permission) {
    return <>children</>;
  }

  return (
    <ProjectPermissionContext.Provider value={permission}>
      {children}
    </ProjectPermissionContext.Provider>
  );
};

export const useProjectPermission = () => {
  const ctx = useContext(ProjectPermissionContext);
  if (!ctx) {
    throw new Error("useProjectPermission to be used within <ProjectPermissionContext>");
  }

  return ctx;
};
