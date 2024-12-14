import { createContext, ReactNode, useContext } from "react";

import { useGetUserProjectPermissions } from "@app/hooks/api";
import { TProjectMembership } from "@app/hooks/api/users/types";

import { useWorkspace } from "../WorkspaceContext";
import { TProjectPermission } from "./types";

type Props = {
  children: ReactNode;
};

const ProjectPermissionContext = createContext<null | {
  permission: TProjectPermission;
  membership: TProjectMembership;
}>(null);

export const ProjectPermissionProvider = ({ children }: Props): JSX.Element => {
  const { currentWorkspace, isLoading: isWsLoading } = useWorkspace();
  const workspaceId = currentWorkspace?.id || "";
  const { data: permission, isLoading } = useGetUserProjectPermissions({ workspaceId });

  if ((isLoading && currentWorkspace) || isWsLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bunker-800">
        <img
          src="/images/loading/loading.gif"
          height={70}
          width={120}
          decoding="async"
          loading="lazy"
          alt="infisical loading indicator"
        />
      </div>
    );
  }

  if (!permission && currentWorkspace) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-bunker-800">
        Failed to load user permissions
      </div>
    );
  }

  return (
    <ProjectPermissionContext.Provider value={permission!}>
      {children}
    </ProjectPermissionContext.Provider>
  );
};

export const useProjectPermission = () => {
  const ctx = useContext(ProjectPermissionContext);
  if (!ctx) {
    throw new Error("useProjectPermission to be used within <ProjectPermissionContext>");
  }

  const hasProjectRole = (role: string) => ctx?.membership?.roles?.includes(role) || false;

  return { ...ctx, hasProjectRole };
};
