import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import {
  LookingForOrgPageLink,
  PageHeader,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { getProjectBaseURL, hidesProjects } from "@app/helpers/project";
import { useScopeVariant } from "@app/hooks";
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
  const scopeVariant = useScopeVariant();
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
  const projectsHidden = hidesProjects(currentProject.type);
  const hasTabs = isCertManager || isSecretManager;

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
    <div className="mx-auto flex flex-col justify-between bg-page text-foreground">
      <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
        <PageHeader
          scope={currentProject.type}
          title={projectsHidden ? "Access Control" : "Project Access Control"}
          description={
            projectsHidden
              ? "Manage access for users, groups, and machine identities."
              : "Manage fine-grained access for users, groups, roles, and machine identities within your project resources."
          }
        >
          <LookingForOrgPageLink page="accessControl" />
        </PageHeader>
        {hasTabs ? (
          <Tabs value={selectedTab} onValueChange={updateSelectedTab}>
            <TabsList variant={scopeVariant} aria-label="Project access control sections">
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
      <PageTitle title={t("page-titles.access-control")} />
      <link rel="icon" href="/infisical.ico" />
      <Page />
    </>
  );
};
