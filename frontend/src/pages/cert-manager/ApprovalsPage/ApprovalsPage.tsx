import { useState } from "react";
import { Helmet } from "react-helmet";
import { useSearch } from "@tanstack/react-router";

import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { useProject } from "@app/context";

import { CodeSigningGrantsTab } from "./components/CodeSigningGrantsTab";
import { CodeSigningPolicyTab } from "./components/CodeSigningPolicyTab";
import { CodeSigningRequestsTab } from "./components/CodeSigningRequestsTab";
import { PolicyTab } from "./components/PolicyTab";
import { RequestsTab } from "./components/RequestsTab";

enum CertApprovalTabs {
  Requests = "requests",
  Policies = "policies"
}

enum CodeSigningApprovalTabs {
  Requests = "code-signing-requests",
  Policies = "code-signing-policies",
  Grants = "code-signing-grants"
}

export const ApprovalsPage = () => {
  const { currentProject } = useProject();
  const { section } = useSearch({ strict: false }) as { section?: string };

  const isCodeSigning = section === "code-signing";

  const [certTab, setCertTab] = useState(CertApprovalTabs.Requests);
  const [codeSigningTab, setCodeSigningTab] = useState(CodeSigningApprovalTabs.Requests);

  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={currentProject.type}
          title={isCodeSigning ? "Code Signing" : "Certificate Approvals"}
          description={
            isCodeSigning
              ? "Manage signing policies, review signing requests, and monitor grants."
              : "Manage approval workflows, update policy settings, and monitor request statuses."
          }
        />

        {!isCodeSigning && (
          <Tabs
            orientation="vertical"
            value={certTab}
            onValueChange={(value) => setCertTab(value as CertApprovalTabs)}
          >
            <TabList>
              <Tab variant="project" value={CertApprovalTabs.Requests}>
                Requests
              </Tab>
              <Tab variant="project" value={CertApprovalTabs.Policies}>
                Policies
              </Tab>
            </TabList>
            <TabPanel value={CertApprovalTabs.Requests}>
              <RequestsTab />
            </TabPanel>
            <TabPanel value={CertApprovalTabs.Policies}>
              <PolicyTab />
            </TabPanel>
          </Tabs>
        )}

        {isCodeSigning && (
          <Tabs
            orientation="vertical"
            value={codeSigningTab}
            onValueChange={(value) => setCodeSigningTab(value as CodeSigningApprovalTabs)}
          >
            <TabList>
              <Tab variant="project" value={CodeSigningApprovalTabs.Requests}>
                Signing Requests
              </Tab>
              <Tab variant="project" value={CodeSigningApprovalTabs.Policies}>
                Signing Policies
              </Tab>
              <Tab variant="project" value={CodeSigningApprovalTabs.Grants}>
                Grants
              </Tab>
            </TabList>
            <TabPanel value={CodeSigningApprovalTabs.Requests}>
              <CodeSigningRequestsTab />
            </TabPanel>
            <TabPanel value={CodeSigningApprovalTabs.Policies}>
              <CodeSigningPolicyTab />
            </TabPanel>
            <TabPanel value={CodeSigningApprovalTabs.Grants}>
              <CodeSigningGrantsTab />
            </TabPanel>
          </Tabs>
        )}
      </div>
    </div>
  );
};
