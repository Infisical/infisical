import { Modal, ModalContent } from "@app/components/v2";
import { useGetExternalKmsById } from "@app/hooks/api";
import { ExternalKmsProvider } from "@app/hooks/api/kms/types";

import { AwsKmsForm } from "./AwsKmsForm";
import { GcpKmsForm } from "./GcpKmsForm";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  kmsId: string;
  provider: ExternalKmsProvider;
};

export const EditExternalKmsDetailsModal = ({ isOpen, onOpenChange, kmsId, provider }: Props) => {
  const { data: kms } = useGetExternalKmsById({ kmsId, provider });

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        title="Edit KMS Details"
        subTitle="Update the name and description for this KMS."
        bodyClassName="overflow-visible"
      >
        {kms?.externalKms?.provider === ExternalKmsProvider.Aws && (
          <AwsKmsForm
            kms={kms}
            mode="details"
            onCancel={() => onOpenChange(false)}
            onCompleted={() => onOpenChange(false)}
          />
        )}
        {kms?.externalKms?.provider === ExternalKmsProvider.Gcp && (
          <GcpKmsForm
            kms={kms}
            mode="details"
            onCancel={() => onOpenChange(false)}
            onCompleted={() => onOpenChange(false)}
          />
        )}
      </ModalContent>
    </Modal>
  );
};
