import { useCallback, useEffect, useMemo } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import { CreatePkiSyncModal } from "@app/components/pki-syncs";
import { Button, Spinner } from "@app/components/v2";
import { DocumentationLinkBadge } from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub, useOrganization, useProject } from "@app/context";
import { ProjectPermissionPkiSyncActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { useListPkiSyncs } from "@app/hooks/api/pkiSyncs";
import { IntegrationsListPageTabs } from "@app/types/integrations";

import { PkiSyncsTable } from "./PkiSyncTable";

export const PkiSyncsTab = () => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["addSync"] as const);

  const { addSync, connectionId, connectionName, ...search } = useSearch({
    from: ROUTE_PATHS.CertManager.IntegrationsListPage.id
  });

  const navigate = useNavigate();

  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const memoizedSearch = useMemo(() => search, [search]);

  const navigateToBase = useCallback(() => {
    navigate({
      to: ROUTE_PATHS.CertManager.IntegrationsListPage.path,
      params: {
        projectId: currentProject?.id,
        orgId: currentOrg.id
      },
      search: memoizedSearch
    });
  }, [navigate, currentProject?.id, currentOrg.id, memoizedSearch]);

  useEffect(() => {
    if (!addSync) return;

    handlePopUpOpen("addSync", addSync);
    navigateToBase();
  }, [addSync, handlePopUpOpen, navigateToBase]);

  useEffect(() => {
    const storedFormData = localStorage.getItem("pkiSyncFormData");
    if (storedFormData && !popUp.addSync.isOpen) {
      try {
        const parsedData = JSON.parse(storedFormData);
        if (connectionId && connectionName) {
          const initialData = {
            ...parsedData,
            connection: { id: connectionId, name: connectionName }
          };
          handlePopUpOpen("addSync", { destination: parsedData.destination, initialData });
          navigate({
            to: ROUTE_PATHS.CertManager.IntegrationsListPage.path,
            params: { projectId: currentProject?.id, orgId: currentOrg.id },
            search: { selectedTab: IntegrationsListPageTabs.PkiSyncs },
            replace: true
          });
        } else {
          handlePopUpOpen("addSync", { destination: parsedData.destination });
        }
        localStorage.removeItem("pkiSyncFormData");
      } catch (error) {
        console.error("Failed to parse stored PKI sync form data:", error);
        localStorage.removeItem("pkiSyncFormData");
        handlePopUpOpen("addSync");
      }
    }
  }, [
    handlePopUpOpen,
    popUp.addSync.isOpen,
    connectionId,
    connectionName,
    navigate,
    currentProject?.id,
    currentOrg.id
  ]);

  const { data: pkiSyncs = [], isPending: isPkiSyncsPending } = useListPkiSyncs(
    currentProject?.id || "",
    {
      refetchInterval: 30000
    }
  );

  if (isPkiSyncsPending)
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2">
        <Spinner />
      </div>
    );

  return (
    <>
      <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="flex items-start gap-1">
              <div className="flex items-center gap-x-2">
                <p className="text-xl font-medium text-mineshaft-100">Certificate Syncs</p>
                <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/pki/certificate-syncs/overview" />
              </div>
            </div>
            <p className="text-sm text-bunker-300">
              Use App Connections to sync certificates to third-party services.
            </p>
          </div>
          <ProjectPermissionCan
            I={ProjectPermissionPkiSyncActions.Create}
            a={ProjectPermissionSub.PkiSyncs}
          >
            {(isAllowed) => (
              <Button
                colorSchema="secondary"
                type="button"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => handlePopUpOpen("addSync")}
                isDisabled={!isAllowed}
              >
                Add Sync
              </Button>
            )}
          </ProjectPermissionCan>
        </div>
        <PkiSyncsTable pkiSyncs={pkiSyncs} />
      </div>
      <CreatePkiSyncModal
        selectSync={popUp.addSync.data?.destination || popUp.addSync.data}
        initialData={popUp.addSync.data?.initialData}
        isOpen={popUp.addSync.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addSync", isOpen)}
      />
    </>
  );
};
