import { Helmet } from "react-helmet";

import { PageHeader } from "@app/components/v2";
import { useProject } from "@app/context";
import { LogsSection } from "@app/pages/organization/AuditLogsPage/components";

export const AuditLogsPage = () => {
  const { currentProject } = useProject();

  return (
    <div className="bg-bunker-800 container mx-auto flex flex-col justify-between text-white">
      <Helmet>
        <title>Project Audit Logs</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="bg-bunker-800 flex h-full w-full justify-center text-white">
        <div className="w-full max-w-7xl">
          <PageHeader
            title="Audit logs"
            description="Audit logs for security and compliance teams to monitor information access."
          />
          <LogsSection pageView project={currentProject} />
        </div>
      </div>
    </div>
  );
};
