import { useState } from "react";
import { PenTool } from "lucide-react";

import { PageTitle } from "@app/components/PageTitle";
import { PageHeader } from "@app/components/v3";
import { useProject } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

import { CreateSignerWizard } from "./components/CreateSignerWizard";
import { SignersTable } from "./components/SignersTable";

export const CodeSigningPage = () => {
  const { currentProject } = useProject();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <div className="mx-auto flex h-full flex-col justify-between bg-page text-foreground-inverse">
      <PageTitle title="Code Signing" />
      <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
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
