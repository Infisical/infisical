import type {
  CreateEnvironmentDTO,
  DeleteEnvironmentDTO,
  Project,
  ProjectEnv,
  RestoreEnvironmentDTO,
  UpdateEnvironmentDTO
} from "@app/hooks/api/projects/types";
import type { SubscriptionPlan } from "@app/hooks/api/subscriptions/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type ProjectEnvironmentsAdapter = {
  useProject: (projectId: string) => V4QueryResult<Project>;
  useEnvironmentLimit: (orgId: string) => V4QueryResult<SubscriptionPlan["environmentLimit"]>;
  useCreateEnvironment: V4Mutation<CreateEnvironmentDTO, ProjectEnv>;
  useUpdateEnvironment: V4Mutation<UpdateEnvironmentDTO, object>;
  useDeleteEnvironment: V4Mutation<DeleteEnvironmentDTO, object>;
  useRestoreEnvironment: V4Mutation<RestoreEnvironmentDTO, object>;
};
