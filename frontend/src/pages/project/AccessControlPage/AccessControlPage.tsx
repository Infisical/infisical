import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { withProjectPermission } from "@app/hoc";
import { ProjectType } from "@app/hooks/api/workspace/types";
import { ProjectAccessControlTabs } from "@app/types/project";

import {
  GroupsTab,
  IdentityTab,
  MembersTab,
  ProjectRoleListTab,
  ServiceTokenTab
} from "./components";

const Page = withProjectPermission(
  () => {
    const navigate = useNavigate();
    const { currentWorkspace } = useWorkspace();
    const selectedTab = useSearch({
      strict: false,
      select: (el) => el.selectedTab
    });

    const updateSelectedTab = (tab: string) => {
      navigate({
        to: `/${currentWorkspace.type}/$projectId/access-management` as const,
        search: (prev) => ({ ...prev, selectedTab: tab }),
        params: {
          projectId: currentWorkspace.id
        }
      });
    };

    return (
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        <div className="mx-auto mb-6 w-full max-w-7xl">
          <PageHeader
            title="Access Control"
            description="Manage fine-grained access for users, groups, roles, and identities within your project resources."
          />
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
