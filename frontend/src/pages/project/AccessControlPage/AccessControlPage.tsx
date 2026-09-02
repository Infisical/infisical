import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";

import {
  LookingForOrgPageLink,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectAccessControlTabs } from "@app/types/project";

import {
  GroupsTab,
  IdentityTab,
  MembersTab,
  ProjectRoleListTab,
  ServiceTokenTab
} from "./components";

const Page = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const selectedTab = useSearch({
    strict: false,
    select: (el) => el.selectedTab
  });

  const updateSelectedTab = (tab: string) => {
    navigate({
      to: `${getProjectBaseURL(currentProject.type)}/access-management` as const,
      search: (prev) => ({ ...prev, selectedTab: tab }),
      params: {
        orgId: currentOrg.id,
        projectId: currentProject.id
      }
    });
  };

  const isSecretManager = currentProject.type === ProjectType.SecretManager;
  const isCertManager = currentProject.type === ProjectType.CertificateManager;
  const isAgentVault = currentProject.type === ProjectType.AgentVault;
  // Products without an intermediate project view read as a product, not a project, so they drop the
  // "Project" wording and surface users, identities and groups as tabs rather than a sidebar submenu.
  const isStandaloneProduct = isCertManager || isAgentVault;
  const hasTabs = isStandaloneProduct || isSecretManager;

  const renderTabContent = () => {
    switch (selectedTab) {
      case ProjectAccessControlTabs.Identities:
        return <IdentityTab />;
      case ProjectAccessControlTabs.Groups:
        return <GroupsTab />;
      case ProjectAccessControlTabs.ServiceTokens:
        return isSecretManager ? <ServiceTokenTab /> : <MembersTab />;
      case ProjectAccessControlTabs.Roles:
        return <ProjectRoleListTab />;
      case ProjectAccessControlTabs.Member:
      default:
        return <MembersTab />;
    }
  };

  return (
    <div className="mx-auto flex flex-col justify-between text-foreground">
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          className={hasTabs ? "mb-6" : undefined}
          scope={currentProject.type}
          title={isStandaloneProduct ? "Access Control" : "Project Access Control"}
          description={
            isStandaloneProduct
              ? "Manage access for users, groups, and machine identities."
              : "Manage fine-grained access for users, groups, roles, and machine identities within your project resources."
          }
        >
          <LookingForOrgPageLink page="accessControl" />
        </PageHeader>
        {hasTabs ? (
          <Tabs value={selectedTab} onValueChange={updateSelectedTab}>
            <TabsList
              variant={isAgentVault ? "av" : "project"}
              aria-label="Project access control sections"
            >
              <TabsTrigger value={ProjectAccessControlTabs.Member}>Users</TabsTrigger>
              <TabsTrigger value={ProjectAccessControlTabs.Identities}>
                Machine Identities
              </TabsTrigger>
              <TabsTrigger value={ProjectAccessControlTabs.Groups}>Groups</TabsTrigger>
              {isSecretManager && (
                <TabsTrigger value={ProjectAccessControlTabs.ServiceTokens}>
                  Service Tokens
                </TabsTrigger>
              )}
              {isSecretManager && (
                <TabsTrigger value={ProjectAccessControlTabs.Roles}>Roles</TabsTrigger>
              )}
            </TabsList>
            <TabsContent value={ProjectAccessControlTabs.Member}>
              <MembersTab />
            </TabsContent>
            <TabsContent value={ProjectAccessControlTabs.Identities}>
              <IdentityTab />
            </TabsContent>
            <TabsContent value={ProjectAccessControlTabs.Groups}>
              <GroupsTab />
            </TabsContent>
            {isSecretManager && (
              <TabsContent value={ProjectAccessControlTabs.ServiceTokens}>
                <ServiceTokenTab />
              </TabsContent>
            )}
            <TabsContent value={ProjectAccessControlTabs.Roles}>
              <ProjectRoleListTab />
            </TabsContent>
          </Tabs>
        ) : (
          renderTabContent()
        )}
      </div>
    </div>
  );
};

export const AccessControlPage = () => {
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.members.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <Page />
    </>
  );
};
