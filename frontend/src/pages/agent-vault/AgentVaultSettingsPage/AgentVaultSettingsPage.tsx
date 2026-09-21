import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { SettingsIcon } from "lucide-react";

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle, PageHeader } from "@app/components/v3";
import { useProjectPermission } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { ActivityLoggingSection } from "./components/ActivityLoggingSection";

export const AgentVaultSettingsPage = () => {
  const { t } = useTranslation();
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  return (
    <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col gap-8">
      <Helmet>
        <title>{t("common.head-title", { title: "Settings" })}</title>
      </Helmet>

      {isAdmin ? (
        <>
          <PageHeader
            scope={ProjectType.AgentVault}
            icon={SettingsIcon}
            title="Settings"
            description="How Agent Vault stores what your agents did."
          />
          <div className="flex flex-col gap-4">
            <ActivityLoggingSection />
          </div>
        </>
      ) : (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Settings are administrator only</EmptyTitle>
            <EmptyDescription>
              Ask an Agent Vault administrator to change where session activity is stored.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
};
