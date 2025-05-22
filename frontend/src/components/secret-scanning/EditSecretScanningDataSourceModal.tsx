import { Modal, ModalContent } from "@app/components/v2";
import { TSecretScanningDataSource } from "@app/hooks/api/secretScanningV2";

import { SecretScanningDataSourceForm } from "./forms";
import { SecretScanningDataSourceModalHeader } from "./SecretScanningDataSourceModalHeader";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  dataSource?: TSecretScanningDataSource;
};

export const EditSecretScanningDataSourceModal = ({
  dataSource,
  onOpenChange,
  ...props
}: Props) => {
  if (!dataSource) return null;

  return (
    <Modal {...props} onOpenChange={onOpenChange}>
      <ModalContent
        title={<SecretScanningDataSourceModalHeader isConfigured type={dataSource.type} />}
        className="max-w-2xl"
        bodyClassName="overflow-visible"
      >
        <SecretScanningDataSourceForm
          onComplete={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
          dataSource={dataSource}
          type={dataSource.type}
        />
      </ModalContent>
    </Modal>
  );
};
