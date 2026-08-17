import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";

import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from "@app/components/v3";
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
  const { currentOrg, isSubOrganization } = useOrganization();
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

  return (
    <div className="mx-auto flex flex-col justify-between text-foreground">
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={currentProject.type}
          title={isCertManager ? "Access Control" : "Project Access Control"}
          description={
            isCertManager
              ? "Manage access for users, groups, and machine identities."
              : "Manage fine-grained access for users, groups, roles, and machine identities within your project resources."
          }
        >
          <Link
            to="/organizations/$orgId/access-management"
            params={{
              orgId: currentOrg.id
            }}
            className="flex items-center gap-x-1.5 text-xs whitespace-nowrap text-neutral hover:underline"
          >
            <InfoIcon size={12} /> Looking for {isSubOrganization ? "sub-" : ""}organization access
            control?
          </Link>
        </PageHeader>
        <Tabs
          orientation={isCertManager || isSecretManager ? "horizontal" : "vertical"}
          value={selectedTab}
          onValueChange={updateSelectedTab}
        >
          {(isCertManager || isSecretManager) && (
            <TabsList
              variant="project"
              aria-label="Project access control sections"
              className="w-full justify-start"
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
          )}
          <TabsContent
            value={ProjectAccessControlTabs.Member}
            className={isCertManager || isSecretManager ? undefined : "mt-0"}
          >
            <MembersTab />
          </TabsContent>
          <TabsContent
            value={ProjectAccessControlTabs.Identities}
            className={isCertManager || isSecretManager ? undefined : "mt-0"}
          >
            <IdentityTab />
          </TabsContent>
          <TabsContent
            value={ProjectAccessControlTabs.Groups}
            className={isCertManager || isSecretManager ? undefined : "mt-0"}
          >
            <GroupsTab />
          </TabsContent>
          {isSecretManager && (
            <TabsContent value={ProjectAccessControlTabs.ServiceTokens}>
              <ServiceTokenTab />
            </TabsContent>
          )}
          <TabsContent
            value={ProjectAccessControlTabs.Roles}
            className={isCertManager || isSecretManager ? undefined : "mt-0"}
          >
            <ProjectRoleListTab />
          </TabsContent>
        </Tabs>
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
