import { Helmet } from "react-helmet";

import { PageHeader } from "@app/components/v2";
import { useFetchServerStatus } from "@app/hooks/api";
import { OrgAlertBanner } from "@app/layouts/OrganizationLayout/components/OrgAlertBanner";

import { LogsSection } from "./components";

export const AuditLogsPage = () => {
  const { data: status } = useFetchServerStatus();

  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>Infisical | Audit Logs</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
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
          <LogsSection pageView />
        </div>
      </div>
    </div>
  );
};
