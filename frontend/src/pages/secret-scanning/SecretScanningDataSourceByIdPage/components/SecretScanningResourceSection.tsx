import { faExpand } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionSecretScanningDataSourceActions } from "@app/context/ProjectPermissionContext/types";
import { SECRET_SCANNING_DATA_SOURCE_MAP } from "@app/helpers/secretScanningV2";
import {
  SecretScanningDataSource,
  TSecretScanningDataSource,
  useTriggerSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2";

import { SecretScanningResourcesTable } from "./SecretScanningResourceTable";

// TODO: put behind permission guard

type Props = {
  dataSource: TSecretScanningDataSource;
};

export const SecretScanningResourceSection = ({ dataSource }: Props) => {
  let label: string;
  const triggerDataSourceScan = useTriggerSecretScanningDataSource();

  const handleTriggerScan = async () => {
    try {
      await triggerDataSourceScan.mutateAsync({
        dataSourceId: dataSource.id,
        type: dataSource.type,
        projectId: dataSource.projectId
      });

      createNotification({
        text: "Successfully triggered scan",
        type: "success"
      });
    } catch {
      createNotification({
        text: "Failed to trigger scan",
        type: "error"
      });
    }
  };

  switch (dataSource.type) {
    case SecretScanningDataSource.GitLab:
      label = "Projects";
      break;
    case SecretScanningDataSource.GitHub:
      label = "Repositories";
      break;
    default:
      throw new Error("Unhandled data source type");
  }

  return (
    <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xl font-semibold text-mineshaft-100">{label}</p>
          <p className="text-sm text-bunker-300">
            {label} associated with this {SECRET_SCANNING_DATA_SOURCE_MAP[dataSource.type].name}{" "}
            Data Source
          </p>
        </div>
        <ProjectPermissionCan
          I={ProjectPermissionSecretScanningDataSourceActions.TriggerScans}
          a={ProjectPermissionSub.SecretScanningDataSources}
        >
          {(isAllowed) => (
            <Button
              colorSchema="secondary"
              leftIcon={<FontAwesomeIcon icon={faExpand} />}
              onClick={handleTriggerScan}
              isDisabled={!isAllowed || triggerDataSourceScan.isPending}
              isLoading={triggerDataSourceScan.isPending}
            >
              Scan {label}
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <SecretScanningResourcesTable dataSource={dataSource} label={label} />
    </div>
  );
};
