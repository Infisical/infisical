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
import { useDeleteAgentGateway } from "@app/hooks/api/agentGateways";
import { TAgentGatewayBase } from "@app/hooks/api/agentGateways/types";

type Props = {
  agentGateway?: Pick<TAgentGatewayBase, "id" | "name">;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onDeleted?: () => void;
};

export const DeleteAgentGatewayModal = ({
  agentGateway,
  isOpen,
  onOpenChange,
  onDeleted
}: Props) => {
  const deleteAgentGateway = useDeleteAgentGateway();
  const [inputData, setInputData] = useState("");

  useEffect(() => {
    setInputData("");
  }, [isOpen]);

  if (!agentGateway) return null;

  const handleDelete = async () => {
    try {
      await deleteAgentGateway.mutateAsync({ agentGatewayId: agentGateway.id });
      createNotification({
        text: `Successfully deleted agent gateway "${agentGateway.name}"`,
        type: "success"
      });
      onOpenChange(false);
      onDeleted?.();
    } catch {
      createNotification({ text: "Failed to delete agent gateway", type: "error" });
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-xl!">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>Are you sure you want to delete {agentGateway.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Any agent running through it stops being brokered, and its access list is removed. The
            proxied services it brokered are not deleted. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (inputData === agentGateway.name) handleDelete();
          }}
        >
          <Field>
            <FieldLabel>
              Type <span className="font-bold">{agentGateway.name}</span> to confirm
            </FieldLabel>
            <FieldContent>
              <Input
                value={inputData}
                onChange={(e) => setInputData(e.target.value)}
                placeholder={`Type ${agentGateway.name} here`}
              />
            </FieldContent>
          </Field>
        </form>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            onClick={handleDelete}
            disabled={inputData !== agentGateway.name}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
