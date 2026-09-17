import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";

import { PageHeader } from "@app/components/v3";
import { useProject } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";
import { LogsSection } from "@app/pages/organization/AuditLogsPage/components";

export const AgentVaultAuditLogsPage = () => {
  const { t } = useTranslation();
  const { currentProject } = useProject();

  return (
    <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col gap-8">
      <Helmet>
        <title>{t("common.head-title", { title: "Audit Logs" })}</title>
      </Helmet>
      <PageHeader
        scope={ProjectType.AgentVault}
        icon={FileText}
        title="Audit Logs"
        description="Review Agent Vault activity for security and compliance."
      />
      <LogsSection pageView project={currentProject} />
    </div>
  );
};
