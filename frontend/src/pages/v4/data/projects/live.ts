import { useOrgAdminAccessProject } from "@app/hooks/api/orgAdmin/mutation";
import { useLeaveProject, useRequestProjectAccess } from "@app/hooks/api/projects/mutations";
import {
  useCreateWorkspace,
  useGetDeletedProjects,
  useGetMyPendingProjectAccessRequests,
  useGetUserProjects,
  usePermanentlyDeleteProject,
  useRestoreProject,
  useSearchProjects
} from "@app/hooks/api/projects/queries";
import { useUpdateUserProjectFavorites } from "@app/hooks/api/users/mutation";
import { useGetUserProjectFavorites } from "@app/hooks/api/users/queries";

import type { ProjectsAdapter } from "./contract";

export const projectsLive: ProjectsAdapter = {
  useUserProjects: useGetUserProjects,
  useSearchProjects,
  useMyPendingAccessRequests: useGetMyPendingProjectAccessRequests,
  useProjectFavorites: useGetUserProjectFavorites,
  useUpdateProjectFavorites: useUpdateUserProjectFavorites,
  useCreateProject: useCreateWorkspace,
  useRequestProjectAccess,
  useLeaveProject,
  useOrgAdminAccessProject,
  useDeletedProjects: useGetDeletedProjects,
  useRestoreProject,
  usePermanentlyDeleteProject
};
