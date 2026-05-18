import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { useProject } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

import { CodeSigningGrantsTab } from "../ApprovalsPage/components/CodeSigningGrantsTab";
import { CodeSigningPolicyTab } from "../ApprovalsPage/components/CodeSigningPolicyTab";
import { CreateSignerModal } from "./components/CreateSignerModal";
import { SignersTable } from "./components/SignersTable";

const TABS = ["signers", "signing-policies", "grants"] as const;

export const CodeSigningPage = () => {
  const { t } = useTranslation();
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const { selectedTab } = useSearch({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/code-signing/"
  });

  const activeTab: (typeof TABS)[number] = TABS.includes(selectedTab as (typeof TABS)[number])
    ? (selectedTab as (typeof TABS)[number])
    : "signers";
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <div className="mx-auto flex h-full flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: "Code Signing" })}</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.CertificateManager}
          title="Code Signing"
          description="Securely sign code and artifacts with centralized key management and approval workflows."
        />
        <Tabs
          value={activeTab}
          onValueChange={(v) =>
            navigate({
              to: "/organizations/$orgId/projects/cert-manager/$projectId/code-signing",
              params: { orgId: currentProject.orgId, projectId: currentProject.id },
              search: { selectedTab: v }
            })
          }
        >
          <TabList>
            <Tab variant="project" value="signers">
              Signers
            </Tab>
            <Tab variant="project" value="grants">
              Grants
            </Tab>
            <Tab variant="project" value="signing-policies">
              Signer Policies
            </Tab>
          </TabList>
          <TabPanel value="signers">
            <SignersTable
              projectId={currentProject.id}
              onCreateSigner={() => setIsCreateOpen(true)}
            />
          </TabPanel>
          <TabPanel value="grants">
            <CodeSigningGrantsTab />
          </TabPanel>
          <TabPanel value="signing-policies">
            <CodeSigningPolicyTab />
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
