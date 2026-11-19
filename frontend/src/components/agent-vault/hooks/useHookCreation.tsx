import { useRef, useState } from "react";

import { ComboboxSheetCreationConfig, DiscardChangesAlertDialog } from "@app/components/v3";
import {
  ProjectPermissionAgentVaultHookActions,
  ProjectPermissionSub,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { useDiscardChangesGuard } from "@app/hooks";
import { TAgentVaultHook } from "@app/hooks/api/agentVault/types";

import { HookForm } from "./HookForm";

/** The "Create new hook" row of a hook picker, for whoever can create hooks on a plan that has them. */
export const useHookCreation = (
  onCreated: (hook: TAgentVaultHook) => void
): ComboboxSheetCreationConfig<TAgentVaultHook> | undefined => {
  const { permission } = useProjectPermission();
  const { subscription } = useSubscription();
  const [isDirty, setIsDirty] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const cancelRef = useRef<VoidFunction>(() => {});
  // Bumped on dismissal so a create request that resolves after the sheet closed is ignored.
  const attemptRef = useRef(0);

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({
      isDirty,
      onDiscard: () => {
        attemptRef.current += 1;
        setIsDirty(false);
        cancelRef.current();
      }
    });

  const requestCancel = (cancel: VoidFunction) => {
    cancelRef.current = cancel;
    requestDiscard();
  };

  const canCreate = permission.can(
    ProjectPermissionAgentVaultHookActions.Create,
    ProjectPermissionSub.AgentVaultHooks
  );
  if (!canCreate || !subscription.agentVaultHooks) return undefined;

  const attempt = attemptRef.current;

  return {
    mode: "sheet",
    showHeader: false,
    size: "form",
    emptyLabel: "Create New Hook",
    formatLabel: () => "Create New Hook",
    isPending,
    onDismiss: requestCancel,
    renderForm: ({ complete, cancel }) => (
      <>
        <HookForm
          onSaved={(hook) => {
            if (attempt !== attemptRef.current) return;
            setIsDirty(false);
            setIsDiscardDialogOpen(false);
            onCreated(hook);
            complete();
          }}
          onCancel={() => requestCancel(cancel)}
          onDirtyChange={setIsDirty}
          onPendingChange={setIsPending}
        />
        <DiscardChangesAlertDialog
          open={isDiscardDialogOpen}
          onOpenChange={setIsDiscardDialogOpen}
          onDiscard={confirmDiscard}
          title="Discard Hook?"
          description="The hook you are setting up will be lost."
        />
      </>
    )
  };
};
