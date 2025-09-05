import { Modal, ModalContent } from "@app/components/v2";
import { AUDIT_LOG_STREAM_PROVIDER_MAP } from "@app/helpers/auditLogStreams";
import { TAuditLogStream } from "@app/hooks/api/types";

import { AuditLogStreamForm } from "../AuditLogStreamForm/AuditLogStreamForm";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  auditLogStream?: TAuditLogStream;
};

export const EditAuditLogStreamCredentialsModal = ({
  isOpen,
  onOpenChange,
  auditLogStream
}: Props) => {
  if (!auditLogStream) return null;

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent
        className="max-w-2xl"
        title="Edit Log Stream Credentials"
        subTitle={`Update the credentials for this ${AUDIT_LOG_STREAM_PROVIDER_MAP[auditLogStream.provider].name} Log Stream.`}
      >
        <AuditLogStreamForm
          onComplete={() => onOpenChange(false)}
          auditLogStream={auditLogStream}
        />
      </ModalContent>
    </Modal>
  );
};
