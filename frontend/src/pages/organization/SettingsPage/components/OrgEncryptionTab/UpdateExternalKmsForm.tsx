import { ContentLoader, Modal, ModalContent } from "@app/components/v2";
import { useGetExternalKmsById } from "@app/hooks/api";
import { ExternalKmsProvider } from "@app/hooks/api/kms/types";

import { AwsKmsForm } from "./AwsKmsForm";
import { GcpKmsForm } from "./GcpKmsForm";

type Props = {
  isOpen: boolean;
  kmsId: string;
  provider: ExternalKmsProvider;
  onOpenChange: (state: boolean) => void;
};

export const UpdateExternalKmsForm = ({ isOpen, kmsId, provider, onOpenChange }: Props) => {
  const { data: externalKms, isPending } = useGetExternalKmsById({ kmsId, provider });
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent title="Edit configuration" bodyClassName="overflow-visible">
        {isPending && <ContentLoader />}
        {externalKms?.external?.provider === ExternalKmsProvider.Aws && (
          <AwsKmsForm
            kms={externalKms}
            onCancel={() => onOpenChange(false)}
            onCompleted={() => onOpenChange(false)}
          />
        )}
        {externalKms?.external?.provider === ExternalKmsProvider.Gcp && (
          <GcpKmsForm
            kms={externalKms}
            onCancel={() => onOpenChange(false)}
            onCompleted={() => onOpenChange(false)}
          />
        )}
      </ModalContent>
    </Modal>
  );
};
