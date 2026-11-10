import type {
  TAlert,
  TCreateAlertDTO,
  TListAlertsDTO,
  TTestAlertChannelDTO,
  TTestAlertChannelResponse,
  TUpdateAlertDTO
} from "@app/hooks/api/alerts/types";
import type {
  TListPkiApplicationsParams,
  TListPkiApplicationsResponse
} from "@app/hooks/api/pkiApplications/types";
import type { OrgUser } from "@app/hooks/api/users/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type CertManagerAlertsAdapter = {
  useAlerts: (dto: TListAlertsDTO) => V4QueryResult<TAlert[]>;
  useCreateAlert: V4Mutation<TCreateAlertDTO, TAlert>;
  useUpdateAlert: V4Mutation<TUpdateAlertDTO, TAlert>;
  useDeleteAlert: V4Mutation<{ alertId: string }, { id: string }>;
  useTestAlertChannel: V4Mutation<TTestAlertChannelDTO, TTestAlertChannelResponse>;
  useAlertApplications: (
    params: TListPkiApplicationsParams
  ) => V4QueryResult<TListPkiApplicationsResponse>;
  useAlertOrgUsers: (orgId: string, options?: { enabled?: boolean }) => V4QueryResult<OrgUser[]>;
  useHasEnterpriseAlerting: (orgId: string) => V4QueryResult<boolean>;
};
