import { faArrowUpRightFromSquare, faBookOpen, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ProjectPermissionCan } from "@app/components/permissions";
import { CreateSecretScanningDataSourceModal } from "@app/components/secret-scanning";
import { Button, Spinner } from "@app/components/v2";
import { ProjectPermissionSub, useWorkspace } from "@app/context";
import { ProjectPermissionSecretScanningDataSourceActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { useListSecretScanningDataSources } from "@app/hooks/api/secretScanningV2";

import { SecretScanningDataSourcesTable } from "./SecretScanningDataSourcesTable";

export const SecretScanningDataSourcesSection = () => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["addDataSource"] as const);

  const { currentWorkspace } = useWorkspace();

  const { data: dataSources = [], isPending: isDataSourcesPending } =
    useListSecretScanningDataSources(currentWorkspace.id, {
      refetchInterval: 30000
    });

  if (isDataSourcesPending)
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
            <div className="flex items-center gap-1">
              <p className="text-xl font-semibold text-mineshaft-100">Data Sources</p>
              <a
                href="https://infisical.com/docs/documentation/platform/secret-scanning/overview"
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
              Use App Connections to scan for secret leaks from third-party services.
            </p>
          </div>
          <ProjectPermissionCan
            I={ProjectPermissionSecretScanningDataSourceActions.Create}
            a={ProjectPermissionSub.SecretScanningDataSources}
          >
            {(isAllowed) => (
              <Button
                colorSchema="secondary"
                type="submit"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => handlePopUpOpen("addDataSource")}
                isDisabled={!isAllowed}
              >
                Add Data Source
              </Button>
            )}
          </ProjectPermissionCan>
        </div>
        <SecretScanningDataSourcesTable dataSources={dataSources} />
      </div>
      <CreateSecretScanningDataSourceModal
        isOpen={popUp.addDataSource.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addDataSource", isOpen)}
      />
    </>
  );
};
