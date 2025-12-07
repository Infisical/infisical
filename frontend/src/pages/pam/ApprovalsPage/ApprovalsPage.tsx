import { Helmet } from "react-helmet";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { useOrganization, useProject } from "@app/context";
import { ApprovalControlTabs } from "@app/types/project";

import { ApprovalRequestTab } from "./components/ApprovalRequestTab";
import { PolicyTab } from "./components/PolicyTab";
import { RequestGrantTab } from "./components/RequestGrantTab";

const Page = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const selectedTab = useSearch({
    strict: false,
    select: (el) => el.selectedTab
  });

  const updateSelectedTab = (tab: string) => {
    navigate({
      to: "/organizations/$orgId/projects/pam/$projectId/approvals",
      search: (prev) => ({ ...prev, selectedTab: tab }),
      params: {
        orgId: currentOrg.id,
        projectId: currentProject.id
      }
    });
  };

  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={currentProject.type}
          title="PAM Approvals"
          description="Manage approval workflows, update policy settings, and monitor request statuses."
        />
        <Tabs orientation="vertical" value={selectedTab} onValueChange={updateSelectedTab}>
          <TabList>
            <Tab variant="project" value={ApprovalControlTabs.Requests}>
              Requests
            </Tab>
            <Tab variant="project" value={ApprovalControlTabs.Policies}>
              Policies
            </Tab>
            <Tab variant="project" value={ApprovalControlTabs.Grants}>
              Grants
            </Tab>
          </TabList>
          <TabPanel value={ApprovalControlTabs.Requests}>
            <ApprovalRequestTab />
          </TabPanel>
          <TabPanel value={ApprovalControlTabs.Policies}>
            <PolicyTab />
          </TabPanel>
          <TabPanel value={ApprovalControlTabs.Grants}>
            <RequestGrantTab />
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
};

export const ApprovalsPage = () => {
  return (
    <>
      <Helmet>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <Page />
    </>
  );
};
