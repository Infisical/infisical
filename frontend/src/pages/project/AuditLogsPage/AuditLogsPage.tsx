import { PageTitle } from "@app/components/PageTitle";
import { LookingForOrgPageLink } from "@app/components/v3";
import { PageHeader } from "@app/components/v3/platform";
import { useProject } from "@app/context";
import { hidesProjects } from "@app/helpers/project";
import { useScopeVariant } from "@app/hooks";

import { ProjectAuditLogsTabs } from "./components";

export const AuditLogsPage = () => {
  const scopeVariant = useScopeVariant();
  const { currentProject } = useProject();
  const projectsHidden = hidesProjects(currentProject.type);
  return (
    <div className="mx-auto flex flex-col justify-between bg-page text-foreground-inverse">
      <PageTitle title={projectsHidden ? "Audit Logs" : "Project Audit Logs"} />
      <link rel="icon" href="/infisical.ico" />
      <div className="flex h-full w-full justify-center bg-page text-foreground-inverse">
        <div className="w-full max-w-8xl">
          <PageHeader
            scope={currentProject.type}
            title={projectsHidden ? "Audit logs" : "Project Audit logs"}
            description="Audit logs for security and compliance teams to monitor information access."
          >
            <LookingForOrgPageLink page="auditLogs" />
          </PageHeader>
          <ProjectAuditLogsTabs variant={scopeVariant} />
        </div>
      </div>
    </div>
  );
};
