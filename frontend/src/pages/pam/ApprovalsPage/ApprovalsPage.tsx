import { Helmet } from "react-helmet";
import { useSearch } from "@tanstack/react-router";

import { PageHeader } from "@app/components/v2";
import { useProject } from "@app/context";
import { ApprovalControlTabs } from "@app/types/project";

import { ApprovalRequestTab } from "./components/ApprovalRequestTab";
import { PolicyTab } from "./components/PolicyTab";
import { RequestGrantTab } from "./components/RequestGrantTab";

const Page = () => {
  const { currentProject } = useProject();
  const selectedTab = useSearch({
    strict: false,
    select: (el) => el.selectedTab
  });

  const activeTab = (selectedTab as ApprovalControlTabs) || ApprovalControlTabs.Requests;

  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={currentProject.type}
          title="PAM Approvals"
          description="Manage approval workflows, update policy settings, and monitor request statuses."
        />
        <div>
          {activeTab === ApprovalControlTabs.Requests && <ApprovalRequestTab />}
          {activeTab === ApprovalControlTabs.Policies && <PolicyTab />}
          {activeTab === ApprovalControlTabs.Grants && <RequestGrantTab />}
        </div>
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
