import { Helmet } from "react-helmet";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useParams } from "@tanstack/react-router";
import { BanIcon, PencilIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { EditSecretSyncModal } from "@app/components/secret-syncs";
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
  IconButton,
  PageLoader
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionSecretSyncActions } from "@app/context/ProjectPermissionContext/types";
import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { usePopUp } from "@app/hooks";
import { SecretSync, useGetSecretSync } from "@app/hooks/api/secretSyncs";
import { getSecretSyncPermissionSubject } from "@app/lib/fn/permission";
import { IntegrationsListPageTabs } from "@app/types/integrations";

import {
  SecretSyncActionTriggers,
  SecretSyncAuditLogsSection,
  SecretSyncDestinationSection,
  SecretSyncDetailsSection,
  SecretSyncOptionsSection,
  SecretSyncSourceSection
} from "./components";

const PageContent = () => {
  const { destination, syncId, projectId, orgId } = useParams({
    from: ROUTE_PATHS.SecretManager.SecretSyncDetailsByIDPage.id,
    select: (params) => ({
      ...params,
      destination: params.destination as SecretSync
    })
  });

  const { handlePopUpToggle, popUp, handlePopUpOpen } = usePopUp(["editSync"] as const);

  const { data: secretSync, isPending } = useGetSecretSync(destination, syncId, {
    refetchInterval: 30000
  });

  if (isPending) {
    return <PageLoader />;
  }

  if (!secretSync) {
    return (
      <div className="flex h-full w-full items-center justify-center px-20">
        <Empty className="max-w-2xl">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <BanIcon />
            </EmptyMedia>
            <EmptyTitle>
              Could not find {SECRET_SYNC_MAP[destination].name ?? "Secret"} Sync with ID {syncId}
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const destinationDetails = SECRET_SYNC_MAP[secretSync.destination];

  const handleEdit = () => handlePopUpOpen("editSync");

  return (
    <>
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 font-inter text-white">
        <div className="mx-auto mb-6 w-full max-w-8xl">
          <Link
            to={ROUTE_PATHS.SecretManager.IntegrationsListPage.path}
            params={{ orgId, projectId }}
            search={{ selectedTab: IntegrationsListPageTabs.SecretSyncs }}
            className="mb-4 flex w-fit items-center gap-x-1 text-sm text-mineshaft-400 transition duration-100 hover:text-mineshaft-400/80"
          >
            <FontAwesomeIcon icon={faChevronLeft} />
            Secret Syncs
          </Link>
          <div className="mb-6 flex w-full items-center gap-3">
            <img
              alt={`${destinationDetails.name} sync`}
              src={`/images/integrations/${destinationDetails.image}`}
              className="mt-1.5 ml-1 w-12"
            />
            <div className="min-w-0">
              <p className="truncate text-2xl font-medium text-white">{secretSync.name}</p>
              <p className="mt-1 leading-3 text-accent">
                {secretSync.description || `${destinationDetails.name} Sync`}
              </p>
            </div>
            <SecretSyncActionTriggers secretSync={secretSync} onEdit={handleEdit} />
          </div>
          <div className="flex justify-center">
            <div className="mr-4 w-96">
              <Card>
                <CardHeader className="border-b">
                  <CardTitle>Details</CardTitle>
                  <CardAction>
                    <ProjectPermissionCan
                      I={ProjectPermissionSecretSyncActions.Edit}
                      a={getSecretSyncPermissionSubject(secretSync)}
                    >
                      {(isAllowed) => (
                        <IconButton
                          variant="ghost-muted"
                          size="xs"
                          isDisabled={!isAllowed}
                          aria-label="Edit sync details"
                          onClick={handleEdit}
                        >
                          <PencilIcon />
                        </IconButton>
                      )}
                    </ProjectPermissionCan>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <DetailGroup>
                    <SecretSyncDetailsSection secretSync={secretSync} />
                    <SecretSyncSourceSection secretSync={secretSync} />
                    <SecretSyncDestinationSection secretSync={secretSync} />
                  </DetailGroup>
                  <SecretSyncOptionsSection secretSync={secretSync} />
                </CardContent>
              </Card>
            </div>
            <div className="flex flex-1 flex-col gap-4">
              <SecretSyncAuditLogsSection secretSync={secretSync} />
            </div>
          </div>
        </div>
      </div>
      <EditSecretSyncModal
        isOpen={popUp.editSync.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("editSync", isOpen)}
        secretSync={secretSync}
      />
    </>
  );
};

export const SecretSyncDetailsByIDPage = () => {
  return (
    <>
      <Helmet>
        <title>Secret Sync | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <ProjectPermissionCan
        renderGuardBanner
        passThrough={false}
        I={ProjectPermissionSecretSyncActions.Read}
        a={ProjectPermissionSub.SecretSyncs}
      >
        <PageContent />
      </ProjectPermissionCan>
    </>
  );
};
