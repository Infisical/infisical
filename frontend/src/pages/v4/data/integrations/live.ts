import {
  useCreateAppConnection,
  useDeleteAppConnection,
  useRotateAppConnectionCredentials,
  useUpdateAppConnection
} from "@app/hooks/api/appConnections/mutations";
import {
  useAppConnectionOptions,
  useListAppConnections
} from "@app/hooks/api/appConnections/queries";
import { useListGitHubApps } from "@app/hooks/api/gitHubApps/queries";
import { useGetWorkflowIntegrations } from "@app/hooks/api/workflowIntegrations/queries";

import type { IntegrationsAdapter } from "./contract";

export const integrationsLive: IntegrationsAdapter = {
  useConnections: useListAppConnections,
  useConnectionOptions: useAppConnectionOptions,
  useCreateConnection: useCreateAppConnection,
  useUpdateConnection: useUpdateAppConnection,
  useRotateCredentials: useRotateAppConnectionCredentials,
  useDeleteConnection: useDeleteAppConnection,
  useGitHubApps: useListGitHubApps,
  useWorkflowIntegrations: useGetWorkflowIntegrations
};
