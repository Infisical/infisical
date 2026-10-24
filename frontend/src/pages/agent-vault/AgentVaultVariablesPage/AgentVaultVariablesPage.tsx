import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { BracesIcon } from "lucide-react";

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v3";
import { useOrganization, useProjectPermission } from "@app/context";
import { AgentVaultVariableScope } from "@app/hooks/api/agentVault";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

import { VariablesCard } from "./components/VariablesCard";

// Global variables are an admin's alone, so a member sees only their personal ones, without tabs. Nobody can see
// anyone else's personal variables, admins included.
export const AgentVaultVariablesPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { hasProjectRole } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  const selectedTab = useSearch({
    strict: false,
    select: (el) => (el as { selectedTab?: string })?.selectedTab
  });
  const tab =
    isAdmin && selectedTab !== AgentVaultVariableScope.Personal
      ? AgentVaultVariableScope.Global
      : AgentVaultVariableScope.Personal;

  const updateTab = (value: string) => {
    navigate({
      to: "/organizations/$orgId/agent-vault/variables",
      search: (prev) => ({ ...prev, selectedTab: value }),
      params: { orgId: currentOrg.id }
    });
  };

  return (
    <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
      <Helmet>
        <title>{t("common.head-title", { title: "Variables" })}</title>
      </Helmet>

      <PageHeader
        scope={ProjectType.AgentVault}
        icon={BracesIcon}
        title="Variables"
        description={
          tab === AgentVaultVariableScope.Personal
            ? "Your own values, reused across every service you set up. Only you can read them."
            : "Store values once and reference them from services in any access bundle."
        }
      />
      {isAdmin ? (
        <Tabs value={tab} onValueChange={updateTab}>
          <TabsList variant="av" aria-label="Agent Vault variable lists">
            <TabsTrigger value={AgentVaultVariableScope.Global}>Global Variables</TabsTrigger>
            <TabsTrigger value={AgentVaultVariableScope.Personal}>Personal Variables</TabsTrigger>
          </TabsList>
          <TabsContent value={AgentVaultVariableScope.Global}>
            <VariablesCard scope={AgentVaultVariableScope.Global} />
          </TabsContent>
          <TabsContent value={AgentVaultVariableScope.Personal}>
            <VariablesCard scope={AgentVaultVariableScope.Personal} />
          </TabsContent>
        </Tabs>
      ) : (
        <VariablesCard scope={AgentVaultVariableScope.Personal} />
      )}
    </div>
  );
};
