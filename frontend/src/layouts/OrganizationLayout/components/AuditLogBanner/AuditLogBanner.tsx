import { useFetchServerStatus, useListAuditLogStreams } from "@app/hooks/api";

import { OrgAlertBanner } from "../OrgAlertBanner";

export const AuditLogBanner = () => {
  const { data: status, isLoading: isLoadingStatus } = useFetchServerStatus();
  const { data: streams, isLoading: isLoadingStreams } = useListAuditLogStreams();

  if (isLoadingStreams || isLoadingStatus || !streams) return null;

  if (status?.auditLogStorageDisabled && !streams.length) {
    return (
      <OrgAlertBanner
        text="Attention: Audit logs storage is disabled but no audit log streams have been configured."
        link="https://infisical.com/docs/documentation/platform/audit-log-streams/audit-log-streams"
      />
    );
  }

  return null;
};
