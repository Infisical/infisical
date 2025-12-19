import { Helmet } from "react-helmet";
import { Link } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";

import { PageHeader } from "@app/components/v2";
import { useOrganization } from "@app/context";

import { LogsSection } from "./components";

export const AuditLogsPage = () => {
  const { isSubOrganization, currentOrg } = useOrganization();

  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>Infisical | Audit Logs</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div className="flex w-full justify-center bg-bunker-800 pb-6 text-white">
        <div className="w-full max-w-8xl">
          <PageHeader
            scope={isSubOrganization ? "namespace" : "org"}
            title={`${isSubOrganization ? "Sub-Organization" : "Organization"} Audit Logs`}
            description="Audit logs for security and compliance teams to monitor information access."
          >
            {isSubOrganization && (
              <Link
                to="/organizations/$orgId/audit-logs"
                params={{
                  orgId: currentOrg.rootOrgId ?? ""
                }}
                className="flex items-center gap-x-1.5 text-xs whitespace-nowrap text-neutral hover:underline"
              >
                <InfoIcon size={12} /> Looking for root organization audit logs?
              </Link>
            )}
          </PageHeader>
          <LogsSection pageView />
        </div>
      </div>
    </div>
  );
};
