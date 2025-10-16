import { Helmet } from "react-helmet";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { useNamespace } from "@app/context";
import { OrgAccessControlTabSections } from "@app/types/org";

import { IdentityTab } from "./components/IdentityTab/IdentityTab";
import { MembersTab } from "./components/MembersTab/MembersTab";
import { NamespaceRoleListTab } from "./components/NamespaceRoleListTab";

export const AccessManagementPage = () => {
  const navigate = useNavigate();
  const { namespaceId } = useNamespace();
  const selectedTab = useSearch({
    strict: false,
    select: (el) => el.selectedTab
  });

  const updateSelectedTab = (tab: string) => {
    navigate({
      to: "/organization/namespaces/$namespaceId/access-management",
      search: (prev) => ({ ...prev, selectedTab: tab }),
      params: {
        namespaceId
      }
    });
  };

  return (
    <>
      <Helmet>
        <title>Namespace Access Control</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        <div className="mx-auto mb-6 w-full max-w-7xl">
          <PageHeader
            title="Access Control"
            scope="namespace"
            description="Manage fine-grained access for users, groups, roles, and identities within your namespace resources."
          />
          <Tabs value={selectedTab} onValueChange={updateSelectedTab}>
            <TabList>
              <Tab variant="namespace" value={OrgAccessControlTabSections.Member}>
                Users
              </Tab>
              {/* <Tab value={OrgAccessControlTabSections.Groups}>Groups</Tab> */}
              <Tab variant="namespace" value={OrgAccessControlTabSections.Identities}>
                <div className="flex items-center">
                  <p>Machine Identities</p>
                </div>
              </Tab>
              <Tab variant="namespace" value={OrgAccessControlTabSections.Roles}>
                Namespace Roles
              </Tab>
            </TabList>
            <TabPanel value={OrgAccessControlTabSections.Member}>
              <MembersTab />
            </TabPanel>
            {/* <TabPanel value={OrgAccessControlTabSections.Groups}>
              <div>Group</div>
            </TabPanel> */}
            <TabPanel value={OrgAccessControlTabSections.Identities}>
              <IdentityTab />
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
