import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { SquareMenu } from "lucide-react";

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle, PageHeader } from "@app/components/v3";
import { useProject, useProjectPermission } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { AppConnectionsTable } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";

import { ActivityLoggingAlerts } from "./components/ActivityLoggingAlerts";
import { ActivityLoggingSection } from "./components/ActivityLoggingSection";

export const AgentVaultActivityLogsPage = () => {
  const { t } = useTranslation();
  const { currentProject } = useProject();
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  return (
    <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col gap-8">
      <Helmet>
        <title>{t("common.head-title", { title: "Activity Logs" })}</title>
      </Helmet>

      {isAdmin ? (
        <>
          <PageHeader
            scope={ProjectType.AgentVault}
            icon={SquareMenu}
            title="Activity Logs"
            description="Record what your agents reached, and where those records are stored."
          />
          {/* A sibling of the page header, so it sits in the page's own spacing exactly as the
              same warning does on the sessions page, rather than tucked into the card column. */}
          <ActivityLoggingAlerts />
          <div className="flex flex-col gap-4">
            <ActivityLoggingSection />
            <AppConnectionsTable projectId={currentProject.id} projectType={currentProject.type} />
          </div>
        </>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Activity Logs is administrator only</EmptyTitle>
            <EmptyDescription>
              Ask an Agent Vault administrator to configure where session activity is stored and
              manage the connections it uses.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
};
