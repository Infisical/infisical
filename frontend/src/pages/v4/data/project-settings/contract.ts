import type { DeleteWorkspaceDTO, Project, UpdateProjectDTO } from "@app/hooks/api/projects/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type ProjectMembershipFacts = { isAdmin: boolean; isDirectMember: boolean };

export type ProjectSettingsAdapter = {
  useMembershipFacts: (projectId: string) => V4QueryResult<ProjectMembershipFacts>;
  useProject: (projectId: string) => V4QueryResult<Project>;
  useUpdateProject: V4Mutation<UpdateProjectDTO, Project>;
  useDeleteProject: V4Mutation<DeleteWorkspaceDTO, Project>;
};
