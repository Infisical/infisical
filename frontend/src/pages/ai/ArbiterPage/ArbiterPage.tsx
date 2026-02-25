import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { ContentLoader, PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { useOrganization, useProject } from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ArbiterTabs } from "@app/types/project";

import { AgentsTab } from "./components/AgentsTab";
import { LiveFeedTab } from "./components/LiveFeedTab";
import { SessionsTab } from "./components/SessionsTab";
import { SettingsTab } from "./components/SettingsTab";

export const ArbiterPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const selectedTab = useSearch({
    strict: false,
    select: (el: { selectedTab?: string }) => el.selectedTab
  });

  const updateSelectedTab = (tab: string) => {
    navigate({
      to: `${getProjectBaseURL(currentProject.type)}/arbiter` as const,
      search: (prev) => ({ ...prev, selectedTab: tab }),
      params: {
        orgId: currentOrg.id,
        projectId: currentProject.id
      }
    });
  };

  if (!currentProject) {
    return <ContentLoader />;
  }

  return (
    <div className="mx-auto flex max-w-8xl flex-col overflow-hidden">
      <Helmet>
        <title>{t("common.head-title", { title: "Agent Network" })}</title>
      </Helmet>

      <PageHeader
        scope={ProjectType.AI}
        title="Agent Network"
        description="Monitor agent activity, review governance decisions, and replay sessions"
      />

      <Tabs value={selectedTab} orientation="vertical" onValueChange={updateSelectedTab}>
        <TabList>
          <Tab variant="project" value={ArbiterTabs.LiveFeed}>
            Monitoring
          </Tab>
          <Tab variant="project" value={ArbiterTabs.Agents}>
            Network Agents
          </Tab>
          <Tab variant="project" value={ArbiterTabs.Sessions}>
            Session History
          </Tab>
          <Tab variant="project" value={ArbiterTabs.Settings}>
            Settings
          </Tab>
        </TabList>
        <TabPanel value={ArbiterTabs.LiveFeed}>
          <LiveFeedTab />
        </TabPanel>
        <TabPanel value={ArbiterTabs.Sessions}>
          <SessionsTab />
        </TabPanel>
        <TabPanel value={ArbiterTabs.Agents}>
          <AgentsTab />
        </TabPanel>
        <TabPanel value={ArbiterTabs.Settings}>
          <SettingsTab />
        </TabPanel>
      </Tabs>
    </div>
  );
};
