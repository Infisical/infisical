import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useSearch } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";

import { PageHeader, TabPanel, Tabs } from "@app/components/v2";
import { Alert, AlertDescription, AlertTitle } from "@app/components/v3";
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
    {
      name: "General",
      key: "tab-org-general",
      component: OrgGeneralTab,
      description: isSubOrganization
        ? "Update your sub-organization's name and other general settings."
        : "Update your organization's name, incident contacts, and other general settings."
    },
    {
      name: "Security",
      key: "tab-org-security",
      component: OrgSecurityTab,
      description:
        "Configure authentication requirements and access token limits for your organization.",
      isHidden: isSubOrganization
    },
    {
      name: "Encryption",
      key: "tab-org-encryption",
      component: OrgEncryptionTab,
      description: `Configure the key management systems (KMS) used to encrypt your ${
        isSubOrganization ? "sub-" : ""
      }organization's data.`
    },
    {
      name: "Project Templates",
      key: "project-templates",
      component: ProjectTemplatesTab,
      description:
        "Create reusable templates that standardize roles and environments for new projects."
    },
    {
      name: "Product Settings",
      key: "product-settings",
      component: OrgProductSettingsTab,
      description: `Configure product-specific defaults and features across your ${
        isSubOrganization ? "sub-" : ""
      }organization.`
    },
    {
      name: "Sub Organizations",
      key: "tab-sub-organizations",
      component: OrgSubOrgsTab,
      description: "Create and manage sub-organizations to isolate teams, environments, and data.",
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
  const activeTab = visibleTabs.find((item) => item.key === selectedTab);
  const selectedTabName = activeTab?.name;
  const settingsTitle = `${isSubOrganization ? "Sub-Organization" : "Organization"} Settings`;
  const pageTitle = selectedTabName ? `${selectedTabName} - ${settingsTitle}` : settingsTitle;

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: pageTitle })}</title>
      </Helmet>
      <PageHeader
        scope={isSubOrganization ? "namespace" : "org"}
        description={
          activeTab?.description ??
          `Configure ${isSubOrganization ? "sub-" : ""}organization-wide settings`
        }
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
      {selectedTab === "tab-org-general" && (
        <Alert variant="info" className="mb-6">
          <InfoIcon />
          <AlertTitle>Some Settings Have Moved</AlertTitle>
          <AlertDescription>
            <p>
              Audit log streams now live under{" "}
              <Link
                to="/organizations/$orgId/audit-logs"
                params={{ orgId: currentOrg.id }}
                search={{ selectedTab: "streams" }}
                className="underline hover:opacity-80"
              >
                Audit Logs
              </Link>
              , and workflow integrations, OAuth applications, and external migrations have moved to{" "}
              <Link
                to="/organizations/$orgId/integrations"
                params={{ orgId: currentOrg.id }}
                className="underline hover:opacity-80"
              >
                Integrations
              </Link>
              .
            </p>
          </AlertDescription>
        </Alert>
      )}
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
