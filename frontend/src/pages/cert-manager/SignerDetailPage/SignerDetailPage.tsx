import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "@tanstack/react-router";
import { ChevronLeftIcon } from "lucide-react";

import { EmptyState, PageHeader } from "@app/components/v2";
import { Badge, PageLoader } from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";
import {
  getSignerStatusBadgeVariant,
  signerStatusLabels,
  useGetSigner
} from "@app/hooks/api/signers";

import { EditSignerModal } from "./components/EditSignerModal";
import { SignerOverviewSection } from "./components/SignerOverviewSection";
import { SigningOperationsTable } from "./components/SigningOperationsTable";

export const SignerDetailPage = () => {
  const { t } = useTranslation();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const { signerId } = useParams({
    from: ROUTE_PATHS.CertManager.SignerDetailByIDPage.id
  });

  const { data: signer, isLoading } = useGetSigner(signerId);

  if (isLoading) {
    return <PageLoader />;
  }

  if (!signer) {
    return <EmptyState title="Signer not found" />;
  }

  return (
    <div className="mx-auto flex h-full flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: `Signer: ${signer.name}` })}</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <div className="mb-4">
          <Link
            to="/organizations/$orgId/projects/cert-manager/$projectId/code-signing"
            params={{ orgId: currentOrg.id, projectId: currentProject.id }}
            className="flex w-fit items-center gap-x-1 text-sm text-mineshaft-400 transition duration-100 hover:text-mineshaft-400/80"
          >
            <ChevronLeftIcon size={16} />
            Back to Code Signing
          </Link>
        </div>
        <PageHeader
          scope={ProjectType.CertificateManager}
          title={
            <span className="inline-flex items-center gap-x-3">
              {signer.name}
              <Badge variant={getSignerStatusBadgeVariant(signer.status)}>
                {signerStatusLabels[signer.status] ?? signer.status}
              </Badge>
            </span>
          }
          description={signer.description ?? undefined}
        />
        <div className="flex flex-col gap-5 lg:flex-row">
          <div className="w-full lg:max-w-[24rem]">
            <SignerOverviewSection
              signer={signer}
              projectId={currentProject.id}
              onEdit={() => setIsEditOpen(true)}
            />
          </div>
          <div className="flex flex-1 flex-col gap-5">
            <SigningOperationsTable signerId={signerId} projectId={currentProject.id} />
          </div>
        </div>
      </div>
      <EditSignerModal
        isOpen={isEditOpen}
        onOpenChange={setIsEditOpen}
        signer={signer}
        projectId={currentProject.id}
      />
    </div>
  );
};
