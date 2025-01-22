import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { OrgPermissionActions, OrgPermissionSubjects, useOrgPermission } from "@app/context";
import { OrgAccessControlTabSections } from "@app/types/org";

import { OrgGroupsTab, OrgIdentityTab, OrgMembersTab, OrgRoleTabSection } from "./components";

export const AccessManagementPage = () => {
  const { t } = useTranslation();
  const { permission } = useOrgPermission();
  const navigate = useNavigate({
    from: ROUTE_PATHS.Organization.AccessControlPage.path
  });
  const selectedTab = useSearch({
    from: ROUTE_PATHS.Organization.AccessControlPage.id,
    select: (el) => el.selectedTab,
    structuralSharing: true
  });

  const updateSelectedTab = (tab: string) => {
    navigate({
      search: { selectedTab: tab }
    });
  };

  const tabSections = [
    {
      key: OrgAccessControlTabSections.Member,
      label: "Users",
      isHidden: permission.cannot(OrgPermissionActions.Read, OrgPermissionSubjects.Member),
      component: OrgMembersTab
    },
    {
      key: OrgAccessControlTabSections.Groups,
      label: "Groups",
      isHidden: permission.cannot(OrgPermissionActions.Read, OrgPermissionSubjects.Groups),
      component: OrgGroupsTab
    },
    {
      key: OrgAccessControlTabSections.Identities,
      label: "Identities",
      isHidden: permission.cannot(OrgPermissionActions.Read, OrgPermissionSubjects.Identity),
      component: OrgIdentityTab
    },
    {
      key: OrgAccessControlTabSections.Roles,
      label: "Roles",
      isHidden: permission.cannot(OrgPermissionActions.Read, OrgPermissionSubjects.Role),
      component: OrgRoleTabSection
    }
  ];

  return (
    <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-7xl">
        <PageHeader
          title="Organization Access Control"
          description="Manage fine-grained access for users, groups, roles, and identities within your organization resources."
        />
        <Tabs value={selectedTab} onValueChange={updateSelectedTab}>
          <TabList>
            {tabSections
              .filter((el) => !el.isHidden)
              .map((el) => (
                <Tab value={el.key} key={`org-access-tab-${el.key}`}>
                  {el.label}
                </Tab>
              ))}
          </TabList>
          {tabSections
            .filter((el) => !el.isHidden)
            .map(({ key, component: Component }) => (
              <TabPanel value={key} key={`org-access-tab-panel-${key}`}>
                <Component />
              </TabPanel>
            ))}
        </Tabs>
      </div>
    </div>
  );
};
