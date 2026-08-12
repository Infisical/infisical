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
import { TEndpointDevice, useDeleteEndpointDevice } from "@app/hooks/api/endpoint";

type Props = {
  device?: TEndpointDevice;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const DeleteDeviceModal = ({ device, isOpen, onOpenChange }: Props) => {
  const deleteDevice = useDeleteEndpointDevice();

  const onConfirm = () => {
    if (!device) return;
    deleteDevice.mutate(
      { deviceId: device.id },
      {
        onSuccess: () => {
          createNotification({ type: "success", text: `Device "${device.name}" removed` });
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
          <AlertDialogTitle>Remove &quot;{device?.name}&quot;</AlertDialogTitle>
          <AlertDialogDescription>
            The device will stop enforcing egress policy immediately. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            onClick={onConfirm}
            isPending={deleteDevice.isPending}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
