import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useSearch } from "@tanstack/react-router";

import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { useProject } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

import { CodeSigningGrantsTab } from "../ApprovalsPage/components/CodeSigningGrantsTab";
import { CodeSigningPolicyTab } from "../ApprovalsPage/components/CodeSigningPolicyTab";
import { CodeSigningRequestsTab } from "../ApprovalsPage/components/CodeSigningRequestsTab";
import { CreateSignerModal } from "./components/CreateSignerModal";
import { SignersTable } from "./components/SignersTable";

enum CodeSigningTabs {
  Signers = "signers",
  Approvals = "approvals"
}

enum ApprovalSubTabs {
  Requests = "requests",
  Policies = "policies",
  Grants = "grants"
}

export const CodeSigningPage = () => {
  const { t } = useTranslation();
  const { currentProject } = useProject();
  const { tab } = useSearch({ strict: false }) as { tab?: string };
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(
    tab === "approvals" ? CodeSigningTabs.Approvals : CodeSigningTabs.Signers
  );
  const [approvalSubTab, setApprovalSubTab] = useState(ApprovalSubTabs.Requests);

  return (
    <div className="mx-auto flex h-full flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: "Code Signing" })}</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.CertificateManager}
          title="Code Signing"
          description="Manage signers and control who can sign artifacts."
        />

        <Tabs
          orientation="vertical"
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as CodeSigningTabs)}
        >
          <TabList>
            <Tab variant="project" value={CodeSigningTabs.Signers}>
              Signers
            </Tab>
            <Tab variant="project" value={CodeSigningTabs.Approvals}>
              Approvals
            </Tab>
          </TabList>

          <TabPanel value={CodeSigningTabs.Signers}>
            <SignersTable
              projectId={currentProject.id}
              onCreateSigner={() => setIsCreateOpen(true)}
            />
          </TabPanel>
          <TabPanel value={CodeSigningTabs.Approvals}>
            <Tabs
              value={approvalSubTab}
              onValueChange={(value) => setApprovalSubTab(value as ApprovalSubTabs)}
            >
              <TabList>
                <Tab variant="project" value={ApprovalSubTabs.Requests}>
                  Requests
                </Tab>
                <Tab variant="project" value={ApprovalSubTabs.Policies}>
                  Policies
                </Tab>
                <Tab variant="project" value={ApprovalSubTabs.Grants}>
                  Grants
                </Tab>
              </TabList>
              <TabPanel value={ApprovalSubTabs.Requests}>
                <CodeSigningRequestsTab />
              </TabPanel>
              <TabPanel value={ApprovalSubTabs.Policies}>
                <CodeSigningPolicyTab />
              </TabPanel>
              <TabPanel value={ApprovalSubTabs.Grants}>
                <CodeSigningGrantsTab />
              </TabPanel>
            </Tabs>
          </TabPanel>
        </Tabs>
      </div>
      <CreateSignerModal
        isOpen={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        projectId={currentProject.id}
      />
    </div>
  );
};
