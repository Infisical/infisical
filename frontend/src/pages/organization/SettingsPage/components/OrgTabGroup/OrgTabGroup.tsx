import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useSearch } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";

import { PageHeader, TabPanel, Tabs } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useSubscription } from "@app/context";

import { OrgEncryptionTab } from "../OrgEncryptionTab";
import { OrgGeneralTab } from "../OrgGeneralTab";
import { OrgProductSettingsTab } from "../OrgProductSettingsTab";
import { OrgSecurityTab } from "../OrgSecurityTab";
import { OrgSubOrgsTab } from "../OrgSubOrgsTab";
import { ProjectTemplatesTab } from "../ProjectTemplatesTab";

export const OrgTabGroup = () => {
  const { t } = useTranslation();
  const search = useSearch({
    from: ROUTE_PATHS.Organization.SettingsPage.id
  });
  const { currentOrg, isSubOrganization } = useOrganization();
  const { subscription } = useSubscription();

  const tabs = [
    { name: "General", key: "tab-org-general", component: OrgGeneralTab },
    {
      name: "Security",
      key: "tab-org-security",
      component: OrgSecurityTab,
      isHidden: isSubOrganization
    },
    {
      name: "Encryption",
      key: "tab-org-encryption",
      component: OrgEncryptionTab
    },
    {
      name: "Project Templates",
      key: "project-templates",
      component: ProjectTemplatesTab
    },
    {
      name: "Product Settings",
      key: "product-settings",
      component: OrgProductSettingsTab
    },
    {
      name: "Sub Organizations",
      key: "tab-sub-organizations",
      component: OrgSubOrgsTab,
      isHidden: isSubOrganization,
      requiresFeature: !subscription?.subOrganization
    }
  ];

  const visibleTabs = tabs.filter((el) => !el.isHidden);
  const defaultTab = visibleTabs.find((item) => !item.requiresFeature)?.key ?? visibleTabs[0].key;
  const selectedTab = search.selectedTab
    ? (visibleTabs.find((item) => item.key === search.selectedTab && !item.requiresFeature)?.key ??
      defaultTab)
    : defaultTab;
  const selectedTabName = visibleTabs.find((item) => item.key === selectedTab)?.name;
  const settingsTitle = `${isSubOrganization ? "Sub-Organization" : "Organization"} Settings`;
  const pageTitle = selectedTabName ? `${selectedTabName} - ${settingsTitle}` : settingsTitle;

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: pageTitle })}</title>
      </Helmet>
      <PageHeader
        scope={isSubOrganization ? "namespace" : "org"}
        description={`Configure ${isSubOrganization ? "sub-" : ""}organization-wide settings`}
        title={settingsTitle}
      >
        {isSubOrganization && (
          <Link
            to="/organizations/$orgId/settings"
            params={{
              orgId: currentOrg.rootOrgId ?? ""
            }}
            className="flex items-center gap-x-1.5 text-xs whitespace-nowrap text-neutral hover:underline"
          >
            <InfoIcon size={12} /> Looking for root organization settings?
          </Link>
        )}
      </PageHeader>
      <Tabs orientation="vertical" value={selectedTab}>
        {visibleTabs
          .filter((tab) => !tab.requiresFeature)
          .map(({ key, component: Component }) => (
            <TabPanel value={key} key={`tab-panel-${key}`}>
              <Component />
            </TabPanel>
          ))}
      </Tabs>
    </>
  );
};
