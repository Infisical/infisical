import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { BracesIcon } from "lucide-react";

import { AccessRestrictedDialog, PageHeader } from "@app/components/v3";
import { useProjectPermission } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { VariablesCard } from "./components/VariablesCard";

export const AgentVaultVariablesPage = () => {
  const { t } = useTranslation();
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  return (
    <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
      <Helmet>
        <title>{t("common.head-title", { title: "Variables" })}</title>
      </Helmet>

      <PageHeader
        scope={ProjectType.AgentVault}
        icon={BracesIcon}
        title="Variables"
        description="Store values once and reference them from services in any access bundle."
      />
      {/* The variables routes are admin only. */}
      {isAdmin ? <VariablesCard /> : <AccessRestrictedDialog />}
    </div>
  );
};
