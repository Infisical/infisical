import { Helmet } from "react-helmet";

import { PageHeader } from "@app/components/v2";
import { LookingForOrgPageLink } from "@app/components/v3";
import { useProject } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";
import { LogsSection } from "@app/pages/organization/AuditLogsPage/components";

export const AuditLogsPage = () => {
  const { currentProject } = useProject();
  const isCertManager = currentProject.type === ProjectType.CertificateManager;
  return (
    <div className="mx-auto flex flex-col justify-between bg-background text-foreground">
      <Helmet>
        <title>{isCertManager ? "Audit Logs" : "Project Audit Logs"}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="flex h-full w-full justify-center bg-background text-foreground">
        <div className="w-full max-w-8xl">
          <PageHeader
            scope={currentProject.type}
            title={isCertManager ? "Audit logs" : "Project Audit logs"}
            description="Audit logs for security and compliance teams to monitor information access."
          >
            <LookingForOrgPageLink page="auditLogs" />
          </PageHeader>
          <LogsSection pageView project={currentProject} />
        </div>
      </div>
    </div>
  );
};
