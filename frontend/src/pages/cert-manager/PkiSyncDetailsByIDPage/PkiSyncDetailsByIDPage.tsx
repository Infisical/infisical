import { Helmet } from "react-helmet";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { BanIcon, ChevronLeftIcon } from "lucide-react";

import {
  EditPkiSyncModal,
  PkiSyncImportStatusBadge,
  PkiSyncRemoveStatusBadge
} from "@app/components/pki-syncs";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  DetailGroup,
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  PageLoader
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { PKI_SYNC_MAP } from "@app/helpers/pkiSyncs";
import { usePopUp } from "@app/hooks";
import { useGetPkiSync } from "@app/hooks/api/pkiSyncs";
import { IntegrationsListPageTabs } from "@app/types/integrations";

import {
  PkiSyncActionTriggers,
  PkiSyncAuditLogsSection,
  PkiSyncCertificatesSection,
  PkiSyncDestinationSection,
  PkiSyncDetailsSection,
  PkiSyncFieldMappingsSection,
  PkiSyncOptionsSection
} from "./components";

const PageContent = () => {
  const navigate = useNavigate();
  const { syncId, projectId, orgId } = useParams({
    from: ROUTE_PATHS.CertManager.PkiSyncDetailsByIDPage.id
  });
  const { applicationName } = useSearch({
    from: ROUTE_PATHS.CertManager.PkiSyncDetailsByIDPage.id
  });

  const { handlePopUpToggle, popUp, handlePopUpOpen } = usePopUp(["editSync"] as const);

  const { data: pkiSync, isPending } = useGetPkiSync(
    { syncId, projectId },
    {
      refetchInterval: 30000
    }
  );

  if (isPending) {
    return <PageLoader />;
  }

  if (!pkiSync) {
    return (
      <div className="flex h-full w-full items-center justify-center px-20">
        <Empty className="max-w-2xl">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BanIcon />
            </EmptyMedia>
            <EmptyTitle>Could not find PKI Sync with ID {syncId}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const destinationDetails = PKI_SYNC_MAP[pkiSync.destination];

  const handleBack = () => {
    if (applicationName) {
      navigate({
        to: "/organizations/$orgId/projects/cert-manager/$projectId/applications/$applicationName",
        params: { orgId, projectId, applicationName },
        search: { selectedTab: "syncs" }
      });
      return;
    }
    navigate({
      to: ROUTE_PATHS.CertManager.IntegrationsListPage.path,
      params: { projectId, orgId },
      search: { selectedTab: IntegrationsListPageTabs.PkiSyncs }
    });
  };

  const handleEdit = () => handlePopUpOpen("editSync");

  return (
    <>
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 font-inter text-white">
        <div className="mx-auto mb-6 w-full max-w-8xl">
          <button
            type="button"
            onClick={handleBack}
            className="mb-4 flex w-fit cursor-pointer items-center gap-x-1 text-sm text-mineshaft-400 transition duration-100 hover:text-mineshaft-400/80"
          >
            <ChevronLeftIcon className="size-4" />
            {applicationName ? "Back to Application" : "PKI Syncs"}
          </button>
          <div className="mb-6 flex w-full items-center gap-3">
            <img
              alt={`${destinationDetails.name} sync`}
              src={`/images/integrations/${destinationDetails.image}`}
              className="mt-1.5 ml-1 w-12"
            />
            <div className="min-w-0">
              <p className="truncate text-2xl font-medium text-white">{pkiSync.name}</p>
              <p className="mt-1 leading-3 text-accent">
                {pkiSync.description || `${destinationDetails.name} PKI Sync`}
              </p>
            </div>
            <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
              <PkiSyncImportStatusBadge pkiSync={pkiSync} />
              <PkiSyncRemoveStatusBadge pkiSync={pkiSync} />
            </div>
          </div>
          <div className="flex justify-center">
            <div className="mr-4 w-80">
              <Card>
                <CardHeader className="grid-cols-[1fr_auto] border-b">
                  <CardTitle>Details</CardTitle>
                  <CardAction className="col-start-2 row-start-1 self-start justify-self-end">
                    <PkiSyncActionTriggers pkiSync={pkiSync} onEdit={handleEdit} />
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <DetailGroup>
                    <PkiSyncDetailsSection pkiSync={pkiSync} />
                    <PkiSyncDestinationSection pkiSync={pkiSync} />
                    <PkiSyncFieldMappingsSection pkiSync={pkiSync} />
                  </DetailGroup>
                  <PkiSyncOptionsSection pkiSync={pkiSync} />
                </CardContent>
              </Card>
            </div>
            <div className="flex flex-1 flex-col gap-4">
              <PkiSyncCertificatesSection pkiSync={pkiSync} />
              <PkiSyncAuditLogsSection pkiSync={pkiSync} />
            </div>
          </div>
        </div>
      </div>
      <EditPkiSyncModal
        isOpen={popUp.editSync.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("editSync", isOpen)}
        pkiSync={pkiSync}
      />
    </>
  );
};

export const PkiSyncDetailsByIDPage = () => {
  return (
    <>
      <Helmet>
        <title>PKI Sync | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <PageContent />
    </>
  );
};
