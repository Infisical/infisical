import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";

import { PageHeader } from "@app/components/v2";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectAuditLogsTabs } from "@app/pages/project/AuditLogsPage/components";

export const PamAuditLogsPage = () => {
  const { t } = useTranslation();

  return (
    <div className="mx-auto mb-6 w-full max-w-8xl">
      <Helmet>
        <title>{t("common.head-title", { title: "Audit Logs" })}</title>
      </Helmet>
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
