import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useSearch } from "@tanstack/react-router";

import { PageHeader } from "@app/components/v2";
import { useProject } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

import { CodeSigningGrantsTab } from "../ApprovalsPage/components/CodeSigningGrantsTab";
import { CodeSigningPolicyTab } from "../ApprovalsPage/components/CodeSigningPolicyTab";
import { CodeSigningRequestsTab } from "../ApprovalsPage/components/CodeSigningRequestsTab";
import { CreateSignerModal } from "./components/CreateSignerModal";
import { SignersTable } from "./components/SignersTable";

export const CodeSigningPage = () => {
  const { t } = useTranslation();
  const { currentProject } = useProject();
  const { selectedTab } = useSearch({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-manager/$projectId/_cert-manager-layout/code-signing/"
  });

  const activeTab = selectedTab || "signers";
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
          description="Manage signers and control who can sign artifacts."
        />
        <div>
          {activeTab === "signers" && (
            <SignersTable
              projectId={currentProject.id}
              onCreateSigner={() => setIsCreateOpen(true)}
            />
          )}
          {activeTab === "signing-requests" && <CodeSigningRequestsTab />}
          {activeTab === "signing-policies" && <CodeSigningPolicyTab />}
          {activeTab === "grants" && <CodeSigningGrantsTab />}
        </div>
      </div>
      <CreateSignerModal
        isOpen={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        projectId={currentProject.id}
      />
    </div>
  );
};
