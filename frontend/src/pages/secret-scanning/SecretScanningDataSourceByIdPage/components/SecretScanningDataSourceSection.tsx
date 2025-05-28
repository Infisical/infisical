import { faBan, faCheck, faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ProjectPermissionCan } from "@app/components/permissions";
import { EditSecretScanningDataSourceModal } from "@app/components/secret-scanning";
import { GenericFieldLabel } from "@app/components/secret-syncs";
import { Badge, IconButton } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionSecretScanningDataSourceActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { TSecretScanningDataSource } from "@app/hooks/api/secretScanningV2";
import { DataSourceConfigDisplay } from "@app/pages/secret-scanning/SecretScanningDataSourceByIdPage/components/DataSourceConfigDisplay/DataSourceConfigDisplay";

type Props = {
  dataSource: TSecretScanningDataSource;
};

export const SecretScanningDataSourceSection = ({ dataSource }: Props) => {
  const { handlePopUpToggle, popUp, handlePopUpOpen } = usePopUp(["editDataSource"] as const);

  const { name, description, connection, isAutoScanEnabled } = dataSource;

  return (
    <>
      <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
        <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
          <h3 className="font-semibold text-mineshaft-100">Details</h3>
          <ProjectPermissionCan
            I={ProjectPermissionSecretScanningDataSourceActions.Edit}
            a={ProjectPermissionSub.SecretScanningDataSources}
          >
            {(isAllowed) => (
              <IconButton
                variant="plain"
                colorSchema="secondary"
                isDisabled={!isAllowed}
                ariaLabel="Edit sync details"
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
