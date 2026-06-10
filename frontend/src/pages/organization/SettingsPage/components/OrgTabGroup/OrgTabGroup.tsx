import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { PageHeader, TabPanel, Tabs } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useSubscription } from "@app/context";
import { usePopUp } from "@app/hooks/usePopUp";

import { AuditLogStreamsTab } from "../AuditLogStreamTab";
import { ExternalMigrationsTab } from "../ExternalMigrationsTab";
import { OrgEncryptionTab } from "../OrgEncryptionTab";
import { OrgGeneralTab } from "../OrgGeneralTab";
import { OrgProductSettingsTab } from "../OrgProductSettingsTab";
import { OrgProvisioningTab } from "../OrgProvisioningTab";
import { OrgSecurityTab } from "../OrgSecurityTab";
import { OrgSsoTab } from "../OrgSsoTab";
import { OrgSubOrgsTab } from "../OrgSubOrgsTab";
import { OrgWorkflowIntegrationTab } from "../OrgWorkflowIntegrationTab";
import { ProjectTemplatesTab } from "../ProjectTemplatesTab";

export const OrgTabGroup = () => {
  const { t } = useTranslation();
  const search = useSearch({
    from: ROUTE_PATHS.Organization.SettingsPage.id
  });
  const navigate = useNavigate();
  const { currentOrg, isSubOrganization } = useOrganization();
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

  const tabs = [
    { name: "General", key: "tab-org-general", component: OrgGeneralTab },
    {
      name: "SSO",
      key: "sso-settings",
      component: OrgSsoTab,
      isHidden: isSubOrganization
    },
    {
      name: "Provisioning",
      key: "provisioning-settings",
      component: OrgProvisioningTab,
      isHidden: isSubOrganization
    },
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
      name: "Workflow Integrations",
      key: "workflow-integrations",
      component: OrgWorkflowIntegrationTab
    },
    { name: "Audit Log Streams", key: "tag-audit-log-streams", component: AuditLogStreamsTab },
    {
      name: "External Migrations",
      key: "tab-external-migrations",
      component: ExternalMigrationsTab
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

  const handleTabChange = (key: string) => {
    const tab = visibleTabs.find((item) => item.key === key);
    if (tab?.requiresFeature) {
      handlePopUpOpen("upgradePlan");
      return;
    }
    navigate({
      to: "/organizations/$orgId/settings",
      params: { orgId: currentOrg.id },
      search: { selectedTab: key }
    });
  };

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: pageTitle })}</title>
      </Helmet>
      <PageHeader
        scope={isSubOrganization ? "namespace" : "org"}
        description={`Configure ${isSubOrganization ? "sub-" : ""}organization-wide settings`}
        title={selectedTabName ?? settingsTitle}
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
      <Tabs orientation="vertical" value={selectedTab} onValueChange={handleTabChange}>
        {visibleTabs
          .filter((tab) => !tab.requiresFeature)
          .map(({ key, component: Component }) => (
            <TabPanel value={key} key={`tab-panel-${key}`}>
              <Component />
            </TabPanel>
          ))}
      </Tabs>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You need to upgrade your plan to manage sub-organizations."
      />
    </>
  );
};
