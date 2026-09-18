import { useEffect, useState } from "react";
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
  AlertDialogTitle,
  Field,
  FieldContent,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useDeleteProxiedService } from "@app/hooks/api/proxiedServices/mutations";
import { TDashboardProxiedService } from "@app/hooks/api/proxiedServices/types";

type Props = {
  proxiedService?: TDashboardProxiedService;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const DeleteProxiedServiceModal = ({ proxiedService, isOpen, onOpenChange }: Props) => {
  const deleteProxiedService = useDeleteProxiedService();
  const [inputData, setInputData] = useState("");

  useEffect(() => {
    setInputData("");
  }, [isOpen]);

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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (inputData === proxiedService.name) handleDelete();
          }}
        >
          <Field>
            <FieldLabel>
              Type <span className="font-bold">{proxiedService.name}</span> to confirm
            </FieldLabel>
            <FieldContent>
              <Input
                value={inputData}
                onChange={(e) => setInputData(e.target.value)}
                placeholder={`Type ${proxiedService.name} here`}
              />
            </FieldContent>
          </Field>
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            onClick={handleDelete}
            disabled={inputData !== proxiedService.name}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
