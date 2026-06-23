import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
import { AUDIT_LOG_STREAM_PROVIDER_MAP } from "@app/helpers/auditLogStreams";
import { useDeleteAuditLogStream } from "@app/hooks/api";
import { TAuditLogStream } from "@app/hooks/api/types";

type Props = {
  auditLogStream?: TAuditLogStream;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const DeleteAuditLogStreamModal = ({ isOpen, onOpenChange, auditLogStream }: Props) => {
  const deleteAuditLogStream = useDeleteAuditLogStream();

  if (!auditLogStream) return null;

  const { id: auditLogStreamId, provider } = auditLogStream;

  const providerDetails = AUDIT_LOG_STREAM_PROVIDER_MAP[provider];

  const handleDelete = async () => {
    await deleteAuditLogStream.mutateAsync({
      auditLogStreamId,
      provider
    });

    createNotification({
      text: `Successfully deleted ${providerDetails.name} stream`,
      type: "success"
    });

    onOpenChange(false);
  };

  return (
    <DeleteActionModal
      isOpen={isOpen}
      onChange={onOpenChange}
      title="Are you sure you want to delete this log stream?"
      deleteKey="delete"
      onDeleteApproved={handleDelete}
    />
  );
};
