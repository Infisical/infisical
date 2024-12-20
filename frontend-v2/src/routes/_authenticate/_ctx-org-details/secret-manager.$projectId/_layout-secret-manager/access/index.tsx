import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { getProjectTitle } from "@app/helpers/project";
import { withProjectPermission } from "@app/hoc";
import { ProjectType } from "@app/hooks/api/workspace/types";
import { ProjectAccessControlTabs } from "@app/types/project";

import {
  GroupsTab,
  IdentityTab,
  MembersTab,
  ProjectRoleListTab,
  ServiceTokenTab
} from "./-components";

const MembersPage = withProjectPermission(
  () => {
    const navigate = useNavigate({
      from: "/secret-manager/$projectId/access"
    });
    const { currentWorkspace } = useWorkspace();
    const selectedTab = useSearch({
      from: "/_authenticate/_ctx-org-details/secret-manager/$projectId/_layout-secret-manager/access/",
      select: (el) => el.selectedTab
    });

    const updateSelectedTab = (tab: string) => {
      navigate({
        search: (prev) => ({ ...prev, selectedTab: tab })
      });
    };

    return (
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        <div className="mx-auto mb-6 w-full max-w-7xl px-6 py-6">
          <p className="mb-4 mr-4 text-3xl font-semibold text-white">
            {currentWorkspace?.type ? getProjectTitle(currentWorkspace?.type) : "Project"} Access
            Control
          </p>
          <Tabs value={selectedTab} onValueChange={updateSelectedTab}>
            <TabList>
              <Tab value={ProjectAccessControlTabs.Member}>Users</Tab>
              <Tab value={ProjectAccessControlTabs.Groups}>Groups</Tab>
              <Tab value={ProjectAccessControlTabs.Identities}>
                <div className="flex items-center">
                  <p>Machine Identities</p>
                </div>
              </Tab>
              {currentWorkspace?.type === ProjectType.SecretManager && (
                <Tab value={ProjectAccessControlTabs.ServiceTokens}>Service Tokens</Tab>
              )}
              <Tab value={ProjectAccessControlTabs.Roles}>Project Roles</Tab>
            </TabList>
            <TabPanel value={ProjectAccessControlTabs.Member}>
              <MembersTab />
            </TabPanel>
            <TabPanel value={ProjectAccessControlTabs.Groups}>
              <GroupsTab />
            </TabPanel>
            <TabPanel value={ProjectAccessControlTabs.Identities}>
              <IdentityTab />
            </TabPanel>
            {currentWorkspace?.type === ProjectType.SecretManager && (
              <TabPanel value={ProjectAccessControlTabs.ServiceTokens}>
                <ServiceTokenTab />
              </TabPanel>
            )}
            <TabPanel value={ProjectAccessControlTabs.Roles}>
              <ProjectRoleListTab />
            </TabPanel>
          </Tabs>
        </div>
      </div>
    );
  },
  {
    action: ProjectPermissionActions.Read,
    subject: ProjectPermissionSub.Member
  }
);

const WorkspaceMembersRoute = () => {
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.members.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <MembersPage />
    </>
  );
};

const WorkspaceMembersRouteQuerySchema = z.object({
  selectedTab: z.nativeEnum(ProjectAccessControlTabs).catch(ProjectAccessControlTabs.Member)
});

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/secret-manager/$projectId/_layout-secret-manager/access/"
)({
  component: WorkspaceMembersRoute,
  validateSearch: zodValidator(WorkspaceMembersRouteQuerySchema)
});
