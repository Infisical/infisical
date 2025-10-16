import { Helmet } from "react-helmet";

import { PageHeader } from "@app/components/v2";
import { useProject } from "@app/context";
import { LogsSection } from "@app/pages/organization/AuditLogsPage/components";

export const AuditLogsPage = () => {
  const { currentProject } = useProject();

  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <title>Project Audit Logs</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-8xl">
          <PageHeader
            scope="project"
            title="Audit logs"
            description="Audit logs for security and compliance teams to monitor information access."
          />
          <LogsSection pageView project={currentProject} />
        </div>
      </div>
    </div>
  );
};
