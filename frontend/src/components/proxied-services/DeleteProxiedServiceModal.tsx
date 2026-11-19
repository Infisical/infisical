import { createNotification } from "@app/components/notifications";
import { ConfirmationAlertDialog } from "@app/components/v3";
import { useDeleteProxiedService } from "@app/hooks/api/proxiedServices/mutations";
import { TDashboardProxiedService } from "@app/hooks/api/proxiedServices/types";

type Props = {
  proxiedService?: TDashboardProxiedService;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const DeleteProxiedServiceModal = ({ proxiedService, isOpen, onOpenChange }: Props) => {
  const deleteProxiedService = useDeleteProxiedService();

  if (!proxiedService) return null;

  const handleDelete = async () => {
    try {
      await deleteProxiedService.mutateAsync({ serviceId: proxiedService.id });
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
    <ConfirmationAlertDialog
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={`Delete "${proxiedService.name}"`}
      description="The agent proxy will stop brokering credentials for this service. This cannot be undone."
      confirmKey={proxiedService.name}
      isPending={deleteProxiedService.isPending}
      onConfirm={handleDelete}
    />
  );
};
