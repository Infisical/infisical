import {
  useCreateAlert,
  useDeleteAlert,
  useTestAlertChannel,
  useUpdateAlert
} from "@app/hooks/api/alerts/mutations";
import { useListAlerts } from "@app/hooks/api/alerts/queries";
import { useListPkiApplications } from "@app/hooks/api/pkiApplications/queries";
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";
import { useGetOrgUsers } from "@app/hooks/api/users/queries";

import type { CertManagerAlertsAdapter } from "./contract-alerts";

export const alertsLive: CertManagerAlertsAdapter = {
  useAlerts: useListAlerts,
  useCreateAlert,
  useUpdateAlert,
  useDeleteAlert,
  useTestAlertChannel,
  useAlertApplications: useListPkiApplications,
  useAlertOrgUsers: useGetOrgUsers,
  useHasEnterpriseAlerting: (orgId) => {
    const { data, isPending, error } = useGetOrgSubscription({ orgID: orgId });
    return { data: data ? Boolean(data.pkiEnterpriseAlerting) : undefined, isPending, error };
  }
};
