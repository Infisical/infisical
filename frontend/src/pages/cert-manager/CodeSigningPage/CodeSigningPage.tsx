import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { PenTool } from "lucide-react";

import { PageHeader } from "@app/components/v2";
import { useProject } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

import { CreateSignerWizard } from "./components/CreateSignerWizard";
import { SignersTable } from "./components/SignersTable";

export const CodeSigningPage = () => {
  const { t } = useTranslation();
  const { currentProject } = useProject();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <div className="mx-auto flex h-full flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: "Code Signing" })}</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.CertificateManager}
          icon={PenTool}
          title="Code Signing"
          description="Sign release artifacts and binaries with managed signing certificates."
        />
        <SignersTable projectId={currentProject.id} onCreateSigner={() => setIsCreateOpen(true)} />
      </div>
      <CreateSignerWizard
        isOpen={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        projectId={currentProject.id}
      />
    </div>
  );
};
