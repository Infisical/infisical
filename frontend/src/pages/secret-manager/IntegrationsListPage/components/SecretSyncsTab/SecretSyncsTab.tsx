import { useEffect } from "react";
import { faArrowUpRightFromSquare, faBookOpen, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import { CreateSecretSyncModal } from "@app/components/secret-syncs";
import { Button, Spinner } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionSub, useWorkspace } from "@app/context";
import { ProjectPermissionSecretSyncActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { useListSecretSyncs } from "@app/hooks/api/secretSyncs";

import { SecretSyncsTable } from "./SecretSyncTable";

export const SecretSyncsTab = () => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["addSync"] as const);

  const { addSync, ...search } = useSearch({
    from: ROUTE_PATHS.SecretManager.IntegrationsListPage.id
  });

  const navigate = useNavigate();

  const { currentWorkspace } = useWorkspace();

  useEffect(() => {
    if (!addSync) return;

    handlePopUpOpen("addSync", addSync);
    navigate({
      to: ROUTE_PATHS.SecretManager.IntegrationsListPage.path,
      params: {
        projectId: currentWorkspace.id
      },
      search
    });
  }, [addSync]);

  const { data: secretSyncs = [], isPending: isSecretSyncsPending } = useListSecretSyncs(
    currentWorkspace.id,
    {
      refetchInterval: 30000
    }
  );

  if (isSecretSyncsPending)
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
              <p className="text-xl font-semibold text-mineshaft-100">Secret Syncs</p>
              <a
                href="https://infisical.com/docs/integrations/secret-syncs/overview"
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
              Use App Connections to sync secrets to third-party services.
            </p>
          </div>
          <ProjectPermissionCan
            I={ProjectPermissionSecretSyncActions.Create}
            a={ProjectPermissionSub.SecretSyncs}
          >
            {(isAllowed) => (
              <Button
                colorSchema="secondary"
                type="submit"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => handlePopUpOpen("addSync")}
                isDisabled={!isAllowed}
              >
                Add Sync
              </Button>
            )}
          </ProjectPermissionCan>
        </div>
        <SecretSyncsTable secretSyncs={secretSyncs} />
      </div>
      <CreateSecretSyncModal
        selectSync={popUp.addSync.data}
        isOpen={popUp.addSync.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addSync", isOpen)}
      />
    </>
  );
};
