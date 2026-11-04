import { FileText } from "lucide-react";

import { PageTitle } from "@app/components/PageTitle";
import { PageHeader } from "@app/components/v3";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectAuditLogsTabs } from "@app/pages/project/AuditLogsPage/components";

export const AgentVaultAuditLogsPage = () => {
  return (
    <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
      <PageTitle title="Audit Logs" />
      <PageHeader
        scope={ProjectType.AgentVault}
        icon={FileText}
        title="Audit Logs"
        description="Review Agent Vault activity for security and compliance."
      />
      <ProjectAuditLogsTabs variant="av" />
    </div>
  );
};
