import { ServiceIcon } from "@app/components/agent-vault/ServiceIconStack";
import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button
} from "@app/components/v3";
import { useDeleteAgentVaultVariable } from "@app/hooks/api/agentVault";
import { TAgentVaultService, TAgentVaultVariable } from "@app/hooks/api/agentVault/types";

type Props = {
  variable: TAgentVaultVariable | null;
  usedBy: TAgentVaultService[];
  onOpenChange: (isOpen: boolean) => void;
};

export const DeleteVariableDialog = ({ variable, usedBy, onOpenChange }: Props) => {
  const deleteVariable = useDeleteAgentVaultVariable();
  const isInUse = usedBy.length > 0;

  const handleDelete = async () => {
    if (!variable) return;
    try {
      await deleteVariable.mutateAsync({
        accessBundleId: variable.accessBundleId,
        variableId: variable.id
      });
      createNotification({ text: `Variable "${variable.key}" deleted`, type: "success" });
      onOpenChange(false);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  return (
    <AlertDialog open={Boolean(variable)} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &quot;{variable?.key}&quot;</AlertDialogTitle>
          <AlertDialogDescription>
            {isInUse
              ? `${usedBy.length === 1 ? "A service uses" : `${usedBy.length} services use`} this variable. Remove the reference from ${usedBy.length === 1 ? "it" : "them"} before you delete it.`
              : "Its value is deleted with it. This cannot be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isInUse && (
          <ul className="flex max-h-48 flex-col gap-2 overflow-y-auto rounded-md border border-border bg-container/50 p-3">
            {usedBy.map((service) => (
              <li key={service.id} className="flex items-center gap-2 text-sm">
                <ServiceIcon hostPattern={service.hostPattern} />
                {service.name}
              </li>
            ))}
          </ul>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">Cancel</AlertDialogCancel>
          {/* A plain button rather than AlertDialogAction, which closes on click and would drop the
              pending state before the request settles. */}
          <Button
            variant="danger"
            size="sm"
            isDisabled={isInUse}
            isPending={deleteVariable.isPending}
            onClick={handleDelete}
          >
            Delete Variable
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
