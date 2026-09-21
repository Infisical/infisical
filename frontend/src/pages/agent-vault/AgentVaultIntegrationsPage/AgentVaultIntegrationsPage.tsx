import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Blocks } from "lucide-react";

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle, PageHeader } from "@app/components/v3";
import { useProject, useProjectPermission } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { AppConnectionsTable } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";

export const AgentVaultIntegrationsPage = () => {
  const { t } = useTranslation();
  const { currentProject } = useProject();
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  return (
    <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col gap-8">
      <Helmet>
        <title>{t("common.head-title", { title: "Integrations" })}</title>
      </Helmet>

      {isAdmin ? (
        <>
          <PageHeader
            scope={ProjectType.AgentVault}
            icon={Blocks}
            title="Integrations"
            description="Manage integrations with third-party services."
          />
          <AppConnectionsTable projectId={currentProject.id} projectType={currentProject.type} />
        </>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Integrations are administrator only</EmptyTitle>
            <EmptyDescription>
              Ask an Agent Vault administrator to manage the services Agent Vault connects to.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
};
