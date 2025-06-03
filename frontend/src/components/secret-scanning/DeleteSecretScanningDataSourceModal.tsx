import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
import { SECRET_SCANNING_DATA_SOURCE_MAP } from "@app/helpers/secretScanningV2";
import {
  TSecretScanningDataSource,
  useDeleteSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2";

type Props = {
  dataSource?: TSecretScanningDataSource;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onComplete?: () => void;
};

export const DeleteSecretScanningDataSourceModal = ({
  isOpen,
  onOpenChange,
  dataSource,
  onComplete
}: Props) => {
  const deleteDataSource = useDeleteSecretScanningDataSource();

  if (!dataSource) return null;

  const { id: dataSourceId, name, type, projectId } = dataSource;

  const handleDeleteDataSource = async () => {
    const dataSourceType = SECRET_SCANNING_DATA_SOURCE_MAP[type].name;

    try {
      await deleteDataSource.mutateAsync({
        dataSourceId,
        type,
        projectId
      });

      createNotification({
        text: `Successfully deleted ${dataSourceType} Data Source`,
        type: "success"
      });

      if (onComplete) onComplete();
      onOpenChange(false);
    } catch {
      createNotification({
        text: `Failed to delete ${dataSourceType} Data Source`,
        type: "error"
      });
    }
  };

  return (
    <DeleteActionModal
      isOpen={isOpen}
      onChange={onOpenChange}
      title={`Are you sure you want to delete ${name}?`}
      deleteKey={name}
      onDeleteApproved={handleDeleteDataSource}
    >
      <p className="mt-1 font-inter text-sm text-mineshaft-400">
        Findings associated with this data source will be preserved.
      </p>
    </DeleteActionModal>
  );
};
