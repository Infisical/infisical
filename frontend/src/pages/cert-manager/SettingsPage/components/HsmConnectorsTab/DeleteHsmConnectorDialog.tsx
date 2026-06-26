import { TrashIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle
} from "@app/components/v3";
import { THsmConnector, useDeleteHsmConnector } from "@app/hooks/api/hsmConnectors";

type Props = {
  connector: THsmConnector | null;
  onClose: () => void;
  onDeleted?: () => void;
};

export const DeleteHsmConnectorDialog = ({ connector, onClose, onDeleted }: Props) => {
  const deleteMutation = useDeleteHsmConnector();
  const isOpen = Boolean(connector);

  const handleConfirm = async () => {
    if (!connector) return;
    try {
      await deleteMutation.mutateAsync({ connectorId: connector.id });
      createNotification({ type: "success", text: `HSM Connector "${connector.name}" deleted.` });
      onClose();
      onDeleted?.();
    } catch (err) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to delete HSM Connector"
      });
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <TrashIcon className="h-5 w-5 text-danger" />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete HSM Connector</AlertDialogTitle>
          <AlertDialogDescription>
            {connector ? (
              <>
                Are you sure you want to delete{" "}
                <span className="font-mono text-mineshaft-100">{connector.name}</span>? Any
                certificate that references this connector will block the deletion, and the HSM key
                on your HSM is not touched.
              </>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            onClick={handleConfirm}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
