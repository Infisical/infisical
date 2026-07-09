import { Trash2Icon } from "lucide-react";

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
import { useDeleteProxiedService } from "@app/hooks/api/proxiedServices/mutations";
import { TDashboardProxiedService } from "@app/hooks/api/proxiedServices/types";

type Props = {
  proxiedService?: TDashboardProxiedService;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
};

export const DeleteProxiedServiceModal = ({
  proxiedService,
  isOpen,
  onOpenChange,
  projectId
}: Props) => {
  const deleteProxiedService = useDeleteProxiedService();

  if (!proxiedService) return null;

  const handleDelete = async () => {
    try {
      await deleteProxiedService.mutateAsync({ serviceId: proxiedService.id, projectId });
      createNotification({
        text: `Successfully deleted proxied service "${proxiedService.name}"`,
        type: "success"
      });
      onOpenChange(false);
    } catch {
      createNotification({ text: "Failed to delete proxied service", type: "error" });
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-xl!">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>
            Are you sure you want to delete {proxiedService.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            The agent proxy will stop brokering credentials for this service. This action cannot be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="danger" onClick={handleDelete}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
