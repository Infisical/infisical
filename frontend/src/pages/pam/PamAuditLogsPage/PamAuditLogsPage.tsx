import { FileText } from "lucide-react";

import { PageTitle } from "@app/components/PageTitle";
import { PageHeader } from "@app/components/v3/platform";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectAuditLogsTabs } from "@app/pages/project/AuditLogsPage/components";

export const PamAuditLogsPage = () => {
  return (
    <div className="mx-auto mb-6 w-full max-w-8xl">
      <PageTitle title="Audit Logs" />
      <PageHeader
        scope={ProjectType.PAM}
        icon={FileText}
        title="Audit Logs"
        description="Audit logs for security and compliance teams to monitor information access."
      />
      <ProjectAuditLogsTabs variant="pam" />
    </div>
  );
};
