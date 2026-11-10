import { useDeleteWorkspace, useUpdateProject } from "@app/hooks/api/projects/queries";
import { useGetUserProjectPermissions } from "@app/hooks/api/roles/queries";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { useProjectById } from "../projectQuery";
import type { ProjectSettingsAdapter } from "./contract";

export const projectSettingsLive: ProjectSettingsAdapter = {
  useMembershipFacts: (projectId) => {
    const { data, isPending, error } = useGetUserProjectPermissions({ projectId });
    const memberships = data?.memberships ?? [];
    return {
      isPending,
      error,
      data: data && {
        isAdmin: memberships.some((membership) =>
          membership.roles.some((role) => role.role === ProjectMembershipRole.Admin)
        ),
        isDirectMember: memberships.some((membership) => !membership.actorGroupId)
      }
    };
  },
  useProject: useProjectById,
  useUpdateProject,
  useDeleteProject: useDeleteWorkspace
};
