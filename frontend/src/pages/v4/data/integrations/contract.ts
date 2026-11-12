import type {
  TAppConnection,
  TCreateAppConnectionDTO,
  TDeleteAppConnectionDTO,
  TRotateAppConnectionCredentialsDTO,
  TUpdateAppConnectionDTO
} from "@app/hooks/api/appConnections/types";
import type { TAppConnectionOption } from "@app/hooks/api/appConnections/types/app-options";
import type { ProjectType } from "@app/hooks/api/projects/types";
import type { WorkflowIntegration } from "@app/hooks/api/workflowIntegrations/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type IntegrationsAdapter = {
  useConnections: (projectId?: string) => V4QueryResult<TAppConnection[]>;
  useConnectionOptions: (projectType?: ProjectType) => V4QueryResult<TAppConnectionOption[]>;
  useCreateConnection: V4Mutation<TCreateAppConnectionDTO, TAppConnection>;
  useUpdateConnection: V4Mutation<TUpdateAppConnectionDTO, TAppConnection>;
  useRotateCredentials: V4Mutation<TRotateAppConnectionCredentialsDTO, TAppConnection>;
  useDeleteConnection: V4Mutation<TDeleteAppConnectionDTO, TAppConnection>;
  useWorkflowIntegrations: (orgId?: string) => V4QueryResult<WorkflowIntegration[]>;
};
