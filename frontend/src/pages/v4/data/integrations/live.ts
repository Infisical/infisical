import {
  useCreateAppConnection,
  useDeleteAppConnection,
  useRotateAppConnectionCredentials
} from "@app/hooks/api/appConnections/mutations";
import {
  useAppConnectionOptions,
  useListAppConnections
} from "@app/hooks/api/appConnections/queries";
import { useGetWorkflowIntegrations } from "@app/hooks/api/workflowIntegrations/queries";

import type { IntegrationsAdapter } from "./contract";

export const integrationsLive: IntegrationsAdapter = {
  useConnections: useListAppConnections,
  useConnectionOptions: useAppConnectionOptions,
  useCreateConnection: useCreateAppConnection,
  useRotateCredentials: useRotateAppConnectionCredentials,
  useDeleteConnection: useDeleteAppConnection,
  useWorkflowIntegrations: useGetWorkflowIntegrations
};
