import { faBan, faCheck, faEdit, faPlugCircleXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ProjectPermissionCan } from "@app/components/permissions";
import { EditSecretScanningDataSourceModal } from "@app/components/secret-scanning";
import { GenericFieldLabel } from "@app/components/secret-syncs";
import { Badge, IconButton, Tooltip } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionSecretScanningDataSourceActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { TSecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

import { DataSourceConfigDisplay } from "./DataSourceConfigDisplay";

type Props = {
  dataSource: TSecretScanningDataSource;
};

export const SecretScanningDataSourceSection = ({ dataSource }: Props) => {
  const { handlePopUpToggle, popUp, handlePopUpOpen } = usePopUp(["editDataSource"] as const);

  const { name, description, connection, isAutoScanEnabled, isDisconnected } = dataSource;

  return (
    <>
      <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
        <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
          <div className="mr-2 flex flex-1 items-center justify-between">
            <h3 className="font-semibold text-mineshaft-100">Details</h3>
            {isDisconnected && (
              <Tooltip
                className="text-xs"
                content="The external data source has been removed and can no longer be scanned. Delete this data source and re-initialize the connection."
              >
                <div className="ml-auto">
                  <Badge
                    variant="danger"
                    className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap"
                  >
                    <FontAwesomeIcon icon={faPlugCircleXmark} />
                    <span>Disconnected</span>
                  </Badge>
                </div>
              </Tooltip>
            )}
          </div>
          <ProjectPermissionCan
            I={ProjectPermissionSecretScanningDataSourceActions.Edit}
            a={ProjectPermissionSub.SecretScanningDataSources}
          >
            {(isAllowed) => (
              <IconButton
                variant="plain"
                colorSchema="secondary"
                isDisabled={!isAllowed}
                ariaLabel="Edit data source"
                onClick={() => handlePopUpOpen("editDataSource")}
              >
                <FontAwesomeIcon icon={faEdit} />
              </IconButton>
            )}
          </ProjectPermissionCan>
        </div>
        <div>
          <div className="space-y-3">
            <GenericFieldLabel label="Name">{name}</GenericFieldLabel>
            <GenericFieldLabel label="Description">{description}</GenericFieldLabel>
            {connection && (
              <GenericFieldLabel label="Connection">{connection.name}</GenericFieldLabel>
            )}
            <DataSourceConfigDisplay dataSource={dataSource} />
            <GenericFieldLabel label="Auto-Scan">
              {isAutoScanEnabled ? (
                <Badge
                  variant="success"
                  className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap"
                >
                  <FontAwesomeIcon icon={faCheck} />
                  <span>Enabled</span>
                </Badge>
              ) : (
                <Badge className="flex h-5 w-min items-center gap-1.5 whitespace-nowrap bg-mineshaft-400/50 text-bunker-300">
                  <FontAwesomeIcon icon={faBan} />
                  <span>Disabled</span>
                </Badge>
              )}
            </GenericFieldLabel>
          </div>
        </div>
      </div>
      <EditSecretScanningDataSourceModal
        dataSource={dataSource}
        onOpenChange={(isOpen) => handlePopUpToggle("editDataSource", isOpen)}
        isOpen={popUp.editDataSource.isOpen}
      />
    </>
  );
};
