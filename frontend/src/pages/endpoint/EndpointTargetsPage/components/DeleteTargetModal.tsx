import { Trash2 } from "lucide-react";

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
import { TEndpointTarget, useDeleteEndpointTarget } from "@app/hooks/api/endpoint";

type Props = {
  target?: TEndpointTarget;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const DeleteTargetModal = ({ target, isOpen, onOpenChange }: Props) => {
  const deleteTarget = useDeleteEndpointTarget();

  const onConfirm = () => {
    if (!target) return;
    deleteTarget.mutate(
      { targetId: target.id },
      {
        onSuccess: () => {
          createNotification({ type: "success", text: `Target "${target.name}" deleted` });
          onOpenChange(false);
        }
      }
    );
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2 />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete &quot;{target?.name}&quot;</AlertDialogTitle>
          <AlertDialogDescription>
            Devices will close this tunnel on their next policy sync and stop resolving{" "}
            {target?.destination} locally. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="danger" onClick={onConfirm} isPending={deleteTarget.isPending}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
