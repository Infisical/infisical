import { Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Button
} from "@app/components/v3";
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
    if (deleteAuditLogStream.isPending) return;

    try {
      await deleteAuditLogStream.mutateAsync({
        auditLogStreamId,
        provider
      });

      createNotification({
        text: `Successfully deleted ${providerDetails.name} stream`,
        type: "success"
      });

      onOpenChange(false);
    } catch {
      // Error is handled by the mutation's onError handler
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete {providerDetails.name} log stream?</AlertDialogTitle>
          <AlertDialogDescription>
            This will stop audit logs from being sent to this destination. This action cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            variant="danger"
            isPending={deleteAuditLogStream.isPending}
            isDisabled={deleteAuditLogStream.isPending}
            onClick={handleDelete}
          >
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
