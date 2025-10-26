import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { useProject } from "@app/context";
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
        projectId: currentProject.id
      }
    });
  };

  const isSecretManager = currentProject.type === ProjectType.SecretManager;

  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={currentProject.type}
          title="Access Control"
          description="Manage fine-grained access for users, groups, roles, and identities within your project resources."
        />
        <Tabs orientation="vertical" value={selectedTab} onValueChange={updateSelectedTab}>
          <TabList>
            <Tab variant="project" value={ProjectAccessControlTabs.Member}>
              Users
            </Tab>
            <Tab variant="project" value={ProjectAccessControlTabs.Groups}>
              Groups
            </Tab>
            <Tab variant="project" value={ProjectAccessControlTabs.Identities}>
              Identities
            </Tab>
            {isSecretManager && (
              <Tab variant="project" value={ProjectAccessControlTabs.ServiceTokens}>
                Service Tokens
              </Tab>
            )}
            <Tab variant="project" value={ProjectAccessControlTabs.Roles}>
              Roles
            </Tab>
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
          {isSecretManager && (
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
