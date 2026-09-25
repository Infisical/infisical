import { createNotification } from "@app/components/notifications";
import { Alert, AlertDescription, DeleteConfirmDialog } from "@app/components/v3";
import { useDeleteKmipClients } from "@app/hooks/api/kmip";
import { TKmipClient } from "@app/hooks/api/kmip/types";

type Props = {
  kmipClient: TKmipClient;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const DeleteKmipClientModal = ({ isOpen, onOpenChange, kmipClient }: Props) => {
  const deleteKmipClients = useDeleteKmipClients();

  if (!kmipClient) return null;

  const { id, projectId, name } = kmipClient;

  const handleDeleteKmipClient = async () => {
    await deleteKmipClients.mutateAsync({
      id,
      projectId
    });

    createNotification({
      text: "KMIP client successfully deleted",
      type: "success"
    });

    onOpenChange(false);
  };

  return (
    <DeleteConfirmDialog
      isOpen={isOpen}
      title={`Delete KMIP Client ${name}?`}
      description={
        <Alert variant="danger" appearance="borderless">
          <AlertDescription>
            This permanently removes the KMIP client {name}. This cannot be undone.
          </AlertDescription>
        </Alert>
      }
      onOpenChange={onOpenChange}
      confirmKey="confirm"
      confirmLabel="Delete KMIP Client"
      isPending={deleteKmipClients.isPending}
      onConfirm={handleDeleteKmipClient}
    />
  );
};
