import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { OrgPermissionGuardBanner } from "@app/components/permissions/OrgPermissionCan";
import { Button, PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  OrgPermissionActions,
  OrgPermissionGroupActions,
  OrgPermissionIdentityActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission
} from "@app/context";
import { OrgAccessControlTabSections } from "@app/types/org";

import { UpgradePrivilegeSystemModal } from "./components/UpgradePrivilegeSystemModal/UpgradePrivilegeSystemModal";
import { OrgGroupsTab, OrgIdentityTab, OrgMembersTab, OrgRoleTabSection } from "./components";

export const AccessManagementPage = () => {
  const { t } = useTranslation();
  const { permission } = useOrgPermission();
  const { currentOrg, isSubOrganization } = useOrganization();

  const navigate = useNavigate({
    from: ROUTE_PATHS.Organization.AccessControlPage.path
  });
  const selectedTab = useSearch({
    from: ROUTE_PATHS.Organization.AccessControlPage.id,
    select: (el) => el.selectedTab,
    structuralSharing: true
  });

  const [isUpgradePrivilegeSystemModalOpen, setIsUpgradePrivilegeSystemModalOpen] = useState(false);

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
      isHidden: permission.cannot(OrgPermissionGroupActions.Read, OrgPermissionSubjects.Groups),
      component: OrgGroupsTab
    },
    {
      key: OrgAccessControlTabSections.Identities,
      label: "Machine Identities",
      isHidden: permission.cannot(
        OrgPermissionIdentityActions.Read,
        OrgPermissionSubjects.Identity
      ),
      component: OrgIdentityTab
    },
    {
      key: OrgAccessControlTabSections.Roles,
      label: "Roles",
      isHidden: permission.cannot(OrgPermissionActions.Read, OrgPermissionSubjects.Role),
      component: OrgRoleTabSection
    }
  ];

  const hasNoAccess = tabSections.every((tab) => tab.isHidden);

  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={isSubOrganization ? "namespace" : "org"}
          title={`${isSubOrganization ? "Sub-Organization" : "Organization"} Access Control`}
          description="Manage fine-grained access for users, groups, roles, and machine identities within your organization resources."
        />
        {!currentOrg.shouldUseNewPrivilegeSystem && (
          <div className="mt-4 mb-4 flex flex-col rounded-r border-l-2 border-l-primary bg-mineshaft-300/5 px-4 py-2.5">
            <div className="mb-1 flex items-center text-sm">
              <FontAwesomeIcon icon={faInfoCircle} size="sm" className="mr-1.5 text-primary" />
              Your organization is using legacy privilege management
            </div>
            <p className="mt-1 mb-2 text-sm text-bunker-300">
              We&apos;ve developed an improved privilege management system to better serve your
              security needs. Upgrade to our new permission-based approach that allows you to
              explicitly designate who can modify specific access levels, rather than relying on
              hierarchy comparisons.
            </p>
            <Button
              colorSchema="primary"
              className="mt-2 w-fit text-xs"
              onClick={() => setIsUpgradePrivilegeSystemModalOpen(true)}
            >
              Learn More & Upgrade
            </Button>
          </div>
        )}
        <UpgradePrivilegeSystemModal
          isOpen={isUpgradePrivilegeSystemModalOpen}
          onOpenChange={setIsUpgradePrivilegeSystemModalOpen}
        />
        <Tabs orientation="vertical" value={selectedTab} onValueChange={updateSelectedTab}>
          <TabList>
            {tabSections
              .filter((el) => !el.isHidden)
              .map((el) => (
                <Tab
                  variant={isSubOrganization ? "namespace" : "org"}
                  value={el.key}
                  key={`org-access-tab-${el.key}`}
                >
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
      {hasNoAccess && <OrgPermissionGuardBanner />}
    </div>
  );
};
