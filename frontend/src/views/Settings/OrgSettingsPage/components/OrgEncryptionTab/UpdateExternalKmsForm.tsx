import { ContentLoader, Modal, ModalContent } from "@app/components/v2";
import { useGetExternalKmsById } from "@app/hooks/api";
import { ExternalKmsProvider } from "@app/hooks/api/kms/types";

import { AwsKmsForm } from "./AwsKmsForm";

type Props = {
  isOpen: boolean;
  kmsId: string;
  onOpenChange: (state: boolean) => void;
};

export const UpdateExternalKmsForm = ({ isOpen, kmsId, onOpenChange }: Props) => {
  const { data: externalKms, isLoading } = useGetExternalKmsById(kmsId);
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent title="Edit configuration">
        {isLoading && <ContentLoader />}
        {externalKms?.external?.provider === ExternalKmsProvider.AWS && (
          <AwsKmsForm
            kms={externalKms}
            onCancel={() => onOpenChange(false)}
            onCompleted={() => onOpenChange(false)}
          />
        )}
      </ModalContent>
    </Modal>
  );
};
