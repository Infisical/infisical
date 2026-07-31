import { Helmet } from "react-helmet";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { format } from "date-fns";
import { BanIcon, ChevronLeftIcon, TriangleAlertIcon } from "lucide-react";

import {
  EditPkiSyncModal,
  PkiSyncImportStatusBadge,
  PkiSyncRemoveStatusBadge
} from "@app/components/pki-syncs";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
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
import { PkiSyncStatus, useGetPkiSync } from "@app/hooks/api/pkiSyncs";
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

const formatSyncErrorMessage = (message?: string | null) => {
  if (!message) return "An unknown error occurred.";

  try {
    return JSON.stringify(JSON.parse(message), null, 2);
  } catch {
    return message;
  }
};

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
      <div className="flex h-full w-full items-center justify-center px-4 sm:px-20">
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
      <div className="container mx-auto flex min-w-0 flex-col justify-between bg-bunker-800 px-4 font-inter text-white sm:px-6">
        <div className="mx-auto mb-6 w-full max-w-8xl">
          <button
            type="button"
            onClick={handleBack}
            className="mb-4 flex w-fit cursor-pointer items-center gap-x-1 text-sm text-mineshaft-400 transition duration-100 hover:text-mineshaft-400/80"
          >
            <ChevronLeftIcon className="size-4" />
            {applicationName ? "Back to Application" : "Certificate Syncs"}
          </button>
          <div className="mb-6 flex w-full min-w-0 flex-col gap-4 lg:flex-row lg:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <img
                alt={`${destinationDetails.name} sync`}
                src={`/images/integrations/${destinationDetails.image}`}
                className="size-12 shrink-0 object-contain sm:size-14"
              />
              <div className="min-w-0">
                <h1 className="text-2xl leading-tight font-medium break-words text-white sm:text-3xl">
                  {pkiSync.name}
                </h1>
                <p className="mt-1 text-sm leading-snug text-muted sm:text-base">
                  {pkiSync.description || `${destinationDetails.name} PKI Sync`}
                </p>
              </div>
            </div>
            <div className="flex w-full min-w-0 flex-wrap items-center gap-2 lg:ml-auto lg:w-auto lg:shrink-0 lg:justify-end">
              <PkiSyncImportStatusBadge pkiSync={pkiSync} />
              <PkiSyncRemoveStatusBadge pkiSync={pkiSync} />
              <PkiSyncActionTriggers pkiSync={pkiSync} onEdit={handleEdit} />
            </div>
          </div>
          {pkiSync.syncStatus === PkiSyncStatus.Failed && (
            <Alert variant="danger" className="mb-6">
              <TriangleAlertIcon />
              <AlertTitle>Latest sync failed</AlertTitle>
              <AlertDescription>
                {pkiSync.lastSyncedAt && (
                  <p>{format(new Date(pkiSync.lastSyncedAt), "MMM d, yyyy 'at' h:mm aaa")}</p>
                )}
                <p className="break-words whitespace-pre-wrap">
                  {formatSyncErrorMessage(pkiSync.lastSyncMessage)}
                </p>
              </AlertDescription>
            </Alert>
          )}
          <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[20rem_minmax(0,1fr)]">
            <div className="min-w-0">
              <Card>
                <CardHeader className="border-b">
                  <CardTitle>Details</CardTitle>
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
            <div className="flex min-w-0 flex-col gap-4">
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
