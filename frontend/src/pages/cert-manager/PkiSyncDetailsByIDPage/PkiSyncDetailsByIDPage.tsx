import { Helmet } from "react-helmet";
import { faBan, faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useParams } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import { EditPkiSyncModal } from "@app/components/pki-syncs";
import { PkiSyncEditFields } from "@app/components/pki-syncs/types";
import { Button, ContentLoader, EmptyState } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionPkiSyncActions } from "@app/context/ProjectPermissionContext/types";
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
  const { syncId, projectId } = useParams({
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
    return (
      <div className="flex h-full w-full items-center justify-center">
        <ContentLoader />
      </div>
    );
  }

  if (!pkiSync) {
    return (
      <div className="flex h-full w-full items-center justify-center px-20">
        <EmptyState
          className="max-w-2xl rounded-md text-center"
          icon={faBan}
          title={`Could not find PKI Sync with ID ${syncId}`}
        />
      </div>
    );
  }

  const destinationDetails = PKI_SYNC_MAP[pkiSync.destination];

  const handleEditDetails = () => handlePopUpOpen("editSync", PkiSyncEditFields.Details);
  const handleEditOptions = () => handlePopUpOpen("editSync", PkiSyncEditFields.Options);
  const handleEditMappings = () => handlePopUpOpen("editSync", PkiSyncEditFields.Mappings);
  const handleEditDestination = () => handlePopUpOpen("editSync", PkiSyncEditFields.Destination);

  return (
    <>
      <div className="mx-auto flex flex-col justify-between bg-bunker-800 font-inter text-white">
        <div className="mx-auto mb-6 w-full max-w-8xl">
          <Button
            variant="link"
            type="submit"
            leftIcon={<FontAwesomeIcon icon={faChevronLeft} />}
            onClick={() => {
              navigate({
                to: ROUTE_PATHS.CertManager.IntegrationsListPage.path,
                params: {
                  projectId
                },
                search: {
                  selectedTab: IntegrationsListPageTabs.PkiSyncs
                }
              });
            }}
          >
            PKI Syncs
          </Button>
          <div className="mb-6 flex w-full items-center gap-3">
            <img
              alt={`${destinationDetails.name} sync`}
              src={`/images/integrations/${destinationDetails.image}`}
              className="mt-3 ml-1 w-16"
            />
            <div>
              <p className="text-3xl font-medium text-white">{pkiSync.name}</p>
              <p className="leading-3 text-bunker-300">{destinationDetails.name} PKI Sync</p>
            </div>
            <PkiSyncActionTriggers pkiSync={pkiSync} />
          </div>
          <div className="flex justify-center">
            <div className="mr-4 flex w-72 flex-col gap-4">
              <PkiSyncDetailsSection pkiSync={pkiSync} onEditDetails={handleEditDetails} />
              <PkiSyncOptionsSection pkiSync={pkiSync} onEditOptions={handleEditOptions} />
              <PkiSyncFieldMappingsSection pkiSync={pkiSync} onEditMappings={handleEditMappings} />
            </div>
            <div className="flex flex-1 flex-col gap-4">
              <PkiSyncDestinationSection
                pkiSync={pkiSync}
                onEditDestination={handleEditDestination}
              />
              <PkiSyncCertificatesSection pkiSync={pkiSync} />
              <PkiSyncAuditLogsSection pkiSync={pkiSync} />
            </div>
          </div>
        </div>
      </div>
      <EditPkiSyncModal
        isOpen={popUp.editSync.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("editSync", isOpen)}
        fields={popUp.editSync.data}
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
      <ProjectPermissionCan
        renderGuardBanner
        passThrough={false}
        I={ProjectPermissionPkiSyncActions.Read}
        a={ProjectPermissionSub.PkiSyncs}
      >
        <PageContent />
      </ProjectPermissionCan>
    </>
  );
};
