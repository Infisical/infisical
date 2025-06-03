import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionSecretScanningDataSourceActions } from "@app/context/ProjectPermissionContext/types";
import {
  RESOURCE_DESCRIPTION_HELPER,
  SECRET_SCANNING_DATA_SOURCE_MAP
} from "@app/helpers/secretScanningV2";
import {
  TSecretScanningDataSource,
  useTriggerSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2";

import { SecretScanningResourcesTable } from "./SecretScanningResourceTable";

type Props = {
  dataSource: TSecretScanningDataSource;
};

export const SecretScanningResourceSection = ({ dataSource }: Props) => {
  const triggerDataSourceScan = useTriggerSecretScanningDataSource();

  const handleTriggerScan = async () => {
    try {
      await triggerDataSourceScan.mutateAsync({
        dataSourceId: dataSource.id,
        type: dataSource.type,
        projectId: dataSource.projectId
      });

      createNotification({
        text: `Successfully triggered scan for ${dataSource.name}`,
        type: "success"
      });
    } catch {
      createNotification({
        text: `Failed to trigger scan for ${dataSource.name}`,
        type: "error"
      });
    }
  };

  const resourceDetails = RESOURCE_DESCRIPTION_HELPER[dataSource.type];

  return (
    <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xl font-semibold text-mineshaft-100">{resourceDetails.pluralTitle}</p>
          <p className="text-sm text-bunker-300">
            {resourceDetails.pluralTitle} associated with this{" "}
            {SECRET_SCANNING_DATA_SOURCE_MAP[dataSource.type].name} Data Source
          </p>
        </div>
        <ProjectPermissionCan
          I={ProjectPermissionSecretScanningDataSourceActions.TriggerScans}
          a={ProjectPermissionSub.SecretScanningDataSources}
        >
          {(isAllowed) => (
            <Button
              colorSchema="secondary"
              onClick={handleTriggerScan}
              isDisabled={!isAllowed || triggerDataSourceScan.isPending}
              isLoading={triggerDataSourceScan.isPending}
            >
              Scan {resourceDetails.pluralTitle}
            </Button>
          )}
        </ProjectPermissionCan>
      </div>
      <SecretScanningResourcesTable dataSource={dataSource} />
    </div>
  );
};
