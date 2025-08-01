import { Helmet } from "react-helmet";

import { PageHeader } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useFetchServerStatus } from "@app/hooks/api";
import { OrgAlertBanner } from "@app/layouts/OrganizationLayout/components/OrgAlertBanner";
import { LogsSection } from "@app/pages/organization/AuditLogsPage/components";

export const AuditLogsPage = () => {
  const { currentWorkspace } = useWorkspace();
  const { data: status } = useFetchServerStatus();

  return (
    <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <title>Project Audit Logs</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-7xl">
          <PageHeader
            title="Audit logs"
            description="Audit logs for security and compliance teams to monitor information access."
          />
          {status?.auditLogStorageDisabled && (
            <OrgAlertBanner text="Audit logs storage is disabled" />
          )}
          <LogsSection pageView project={currentWorkspace} />
        </div>
      </div>
    </div>
  );
};
