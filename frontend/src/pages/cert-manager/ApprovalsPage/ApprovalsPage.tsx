import { Helmet } from "react-helmet";
import { useSearch } from "@tanstack/react-router";

import { PageHeader } from "@app/components/v2";
import { useProject } from "@app/context";

import { PolicyTab } from "./components/PolicyTab";
import { RequestsTab } from "./components/RequestsTab";

export const ApprovalsPage = () => {
  const { currentProject } = useProject();
  const { selectedTab } = useSearch({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/approvals"
  });

  const activeTab = selectedTab || "requests";

  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={currentProject.type}
          title="Certificate Approvals"
          description="Manage approval workflows, update policy settings, and monitor request statuses."
        />
        <div>
          {activeTab === "requests" && <RequestsTab />}
          {activeTab === "policies" && <PolicyTab />}
        </div>
      </div>
    </div>
  );
};
