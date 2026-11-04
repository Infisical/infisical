import type { TOrgAdminAccessProjectDTO } from "@app/hooks/api/orgAdmin/types";
import type {
  CreateWorkspaceDTO,
  DeletedProject,
  PermanentlyDeleteProjectDTO,
  Project,
  ProjectType,
  RestoreProjectDTO,
  TSearchProjectsDTO
} from "@app/hooks/api/projects/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type TSearchedProject = Project & { isMember: boolean; isDirectMember: boolean };

export type ProjectsAdapter = {
  useUserProjects: () => V4QueryResult<Project[]>;
  useSearchProjects: (
    dto: TSearchProjectsDTO
  ) => V4QueryResult<{ projects: TSearchedProject[]; totalCount: number }>;
  useMyPendingAccessRequests: (options?: { enabled?: boolean }) => V4QueryResult<Map<string, Date>>;
  useProjectFavorites: (orgId: string) => V4QueryResult<string[]>;
  useUpdateProjectFavorites: V4Mutation<{ orgId: string; projectFavorites: string[] }>;
  useCreateProject: V4Mutation<CreateWorkspaceDTO, { data: { project: Project } }>;
  useRequestProjectAccess: V4Mutation<{ projectId: string; comment?: string }>;
  useLeaveProject: V4Mutation<{ projectId: string }>;
  useOrgAdminAccessProject: V4Mutation<TOrgAdminAccessProjectDTO>;
  useDeletedProjects: (
    type?: ProjectType,
    options?: { enabled?: boolean }
  ) => V4QueryResult<DeletedProject[]> & { refetch: () => unknown };
  useRestoreProject: V4Mutation<RestoreProjectDTO>;
  usePermanentlyDeleteProject: V4Mutation<PermanentlyDeleteProjectDTO>;
};
