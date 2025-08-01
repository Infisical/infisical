import { useOrganization } from "@app/context";
import { useFetchServerStatus, useGetAuditLogStreams } from "@app/hooks/api";

import { OrgAlertBanner } from "../OrgAlertBanner";

export const AuditLogBanner = () => {
  const org = useOrganization();
  const { data: status, isLoading: isLoadingStatus } = useFetchServerStatus();
  const { data: streams, isLoading: isLoadingStreams } = useGetAuditLogStreams(org.currentOrg.id);

  if (isLoadingStreams || isLoadingStatus || !streams) return null;

  if (status?.auditLogStorageDisabled && streams.length) {
    return (
      <OrgAlertBanner
        text="Attention: Audit logs storage is disabled but no audit log streams have been configured."
        link="https://infisical.com/docs/documentation/platform/audit-log-streams/audit-log-streams"
      />
    );
  }

  return null;
};
