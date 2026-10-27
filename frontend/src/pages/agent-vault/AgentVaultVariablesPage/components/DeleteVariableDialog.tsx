import { Link } from "@tanstack/react-router";

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
import { useOrganization } from "@app/context";
import { AgentVaultVariableScope, useDeleteAgentVaultVariable } from "@app/hooks/api/agentVault";
import { TAgentVaultVariable } from "@app/hooks/api/agentVault/types";

type Props = {
  variable: TAgentVaultVariable | null;
  onOpenChange: (isOpen: boolean) => void;
};

export const DeleteVariableDialog = ({ variable, onOpenChange }: Props) => {
  const { currentOrg } = useOrganization();
  const deleteVariable = useDeleteAgentVaultVariable();
  const isPersonal = variable?.scope === AgentVaultVariableScope.Personal;
  const usedByServices = variable?.usedByServices ?? [];
  const isInUse = usedByServices.length > 0;

  const handleDelete = async () => {
    if (!variable) return;
    try {
      await deleteVariable.mutateAsync(variable.id);
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
            {isInUse && isPersonal
              ? `${usedByServices.length === 1 ? "Your personal values for a service use" : `Your personal values for ${usedByServices.length} services use`} this variable. Remove it from ${usedByServices.length === 1 ? "the service" : "those services"} before you delete it.`
              : null}
            {isInUse && !isPersonal
              ? `${usedByServices.length === 1 ? "A service uses" : `${usedByServices.length} services use`} this variable. Remove the reference from ${usedByServices.length === 1 ? "it" : "them"} before you delete it.`
              : null}
            {!isInUse && "Its value is deleted with it. This cannot be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isInUse && (
          <ul className="flex max-h-48 flex-col gap-2 overflow-y-auto rounded-md border border-border bg-container/50 p-3">
            {usedByServices.map((service) => (
              <li key={service.id} className="flex items-center gap-2">
                <ServiceIcon hostPattern={service.hostPattern} />
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{service.name}</span>
                  <Link
                    to="/organizations/$orgId/agent-vault/access-bundles/$accessBundleId"
                    params={{ orgId: currentOrg.id, accessBundleId: service.accessBundleId }}
                    className="truncate text-xs text-muted underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {service.accessBundleName}
                  </Link>
                </div>
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
