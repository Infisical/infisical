import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { useNamespace, useProject } from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { OrgAccessControlTabSections } from "@app/types/org";
import { NamespaceRoleListTab } from "./components/NamespaceRoleListTab";

export const AccessManagementPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { namespaceName } = useNamespace();
  const selectedTab = useSearch({
    strict: false,
    select: (el) => el.selectedTab
  });

  const updateSelectedTab = (tab: string) => {
    navigate({
      to: "/organization/namespaces/$namespaceName/access-management",
      search: (prev) => ({ ...prev, selectedTab: tab }),
      params: {
        namespaceName
      }
    });
  };

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.members.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        <div className="mx-auto mb-6 w-full max-w-7xl">
          <PageHeader
            title="Access Control"
            description="Manage fine-grained access for users, groups, roles, and identities within your project resources."
          />
          <Tabs value={selectedTab} onValueChange={updateSelectedTab}>
            <TabList>
              <Tab value={OrgAccessControlTabSections.Member}>Users</Tab>
              <Tab value={OrgAccessControlTabSections.Groups}>Groups</Tab>
              <Tab value={OrgAccessControlTabSections.Identities}>
                <div className="flex items-center">
                  <p>Machine Identities</p>
                </div>
              </Tab>
              <Tab value={OrgAccessControlTabSections.Roles}>Namespace Roles</Tab>
            </TabList>
            <TabPanel value={OrgAccessControlTabSections.Member}>
              <div>Member</div>
            </TabPanel>
            <TabPanel value={OrgAccessControlTabSections.Groups}>
              <div>Group</div>
            </TabPanel>
            <TabPanel value={OrgAccessControlTabSections.Identities}>
              <div>Identity</div>
            </TabPanel>

            <TabPanel value={OrgAccessControlTabSections.Roles}>
              <NamespaceRoleListTab />
            </TabPanel>
          </Tabs>
        </div>
      </div>
    </>
  );
};
