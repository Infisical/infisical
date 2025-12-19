import { Helmet } from "react-helmet";
import { Link } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";

import { PageHeader } from "@app/components/v2";
import { useOrganization, useProject } from "@app/context";
import { LogsSection } from "@app/pages/organization/AuditLogsPage/components";

export const AuditLogsPage = () => {
  const { currentProject } = useProject();
  const { isSubOrganization } = useOrganization();
  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <title>Project Audit Logs</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-8xl">
          <PageHeader
            scope={currentProject.type}
            title="Project Audit logs"
            description="Audit logs for security and compliance teams to monitor information access."
          >
            <Link
              to="/organizations/$orgId/audit-logs"
              params={{
                orgId: currentProject.orgId
              }}
              className="flex items-center gap-x-1.5 text-xs whitespace-nowrap text-neutral hover:underline"
            >
              <InfoIcon size={12} /> Looking for {isSubOrganization ? "sub-" : ""}organization audit
              logs?
            </Link>
          </PageHeader>
          <LogsSection pageView project={currentProject} />
        </div>
      </div>
    </div>
  );
};
