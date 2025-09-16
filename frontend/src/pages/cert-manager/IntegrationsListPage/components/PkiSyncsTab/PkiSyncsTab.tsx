import { useCallback, useEffect, useMemo } from "react";
import { faArrowUpRightFromSquare, faBookOpen, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import { CreatePkiSyncModal } from "@app/components/pki-syncs";
import { Button, Spinner } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub, useWorkspace } from "@app/context";
import { ProjectPermissionPkiSyncActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { useListPkiSyncs } from "@app/hooks/api/pkiSyncs";

import { PkiSyncsTable } from "./PkiSyncTable";

export const PkiSyncsTab = () => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["addSync"] as const);

  const { addSync, ...search } = useSearch({
    from: ROUTE_PATHS.CertManager.IntegrationsListPage.id
  });

  const navigate = useNavigate();

  const { currentWorkspace } = useWorkspace();

  const memoizedSearch = useMemo(() => search, [search]);

  const navigateToBase = useCallback(() => {
    navigate({
      to: ROUTE_PATHS.CertManager.IntegrationsListPage.path,
      params: {
        projectId: currentWorkspace.id
      },
      search: memoizedSearch
    });
  }, [navigate, currentWorkspace.id, memoizedSearch]);

  useEffect(() => {
    if (!addSync) return;

    handlePopUpOpen("addSync", addSync);
    navigateToBase();
  }, [addSync, handlePopUpOpen, navigateToBase]);

  const { data: pkiSyncs = [], isPending: isPkiSyncsPending } = useListPkiSyncs(
    currentWorkspace.id
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
              <p className="text-xl font-semibold text-mineshaft-100">Certificate Syncs</p>
              <a
                href="https://infisical.com/docs/integrations/pki-syncs/overview"
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="ml-1 mt-[0.32rem] inline-block rounded-md bg-yellow/20 px-1.5 text-sm text-yellow opacity-80 hover:opacity-100">
                  <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                  <span>Docs</span>
                  <FontAwesomeIcon
                    icon={faArrowUpRightFromSquare}
                    className="mb-[0.07rem] ml-1.5 text-[10px]"
                  />
                </div>
              </a>
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
        selectSync={popUp.addSync.data}
        isOpen={popUp.addSync.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addSync", isOpen)}
      />
    </>
  );
};
