import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
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
    try {
      await deleteKmipClients.mutateAsync({
        id,
        projectId
      });

      createNotification({
        text: "KMIP client successfully deleted",
        type: "success"
      });

      onOpenChange(false);
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text = error?.response?.data?.message ?? "Failed to delete KMIP client";

      createNotification({
        text,
        type: "error"
      });
    }
  };

  return (
    <DeleteActionModal
      isOpen={isOpen}
      title={`Are you sure you want to delete ${name}?`}
      onChange={onOpenChange}
      deleteKey="confirm"
      onDeleteApproved={handleDeleteKmipClient}
    />
  );
};
