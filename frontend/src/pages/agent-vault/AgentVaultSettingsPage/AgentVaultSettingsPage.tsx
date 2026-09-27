import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { SettingsIcon } from "lucide-react";

import { AccessRestrictedDialog, PageHeader } from "@app/components/v3";
import { useProjectPermission } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { SessionLogAlerts } from "./components/SessionLogAlerts";
import { SessionLogSection } from "./components/SessionLogSection";

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
            description="Configure session logs and the connections Agent Vault uses."
          />
          <SessionLogAlerts />
          <SessionLogSection />
        </>
      ) : (
        <AccessRestrictedDialog />
      )}
    </div>
  );
};
