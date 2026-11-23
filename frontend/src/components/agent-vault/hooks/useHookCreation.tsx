import { ReactNode, useRef, useState } from "react";

import { AgentVaultHooksUpgradeIntent, useUpgradeGate } from "@app/components/license/UpgradeGate";
import {
  ComboboxActionCreationConfig,
  ComboboxSheetCreationConfig,
  DiscardChangesAlertDialog
} from "@app/components/v3";
import {
  ProjectPermissionAgentVaultHookActions,
  ProjectPermissionSub,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { useDiscardChangesGuard } from "@app/hooks";
import { TAgentVaultHook } from "@app/hooks/api/agentVault/types";

import { HookForm } from "./HookForm";

/**
 * The "Create new hook" row of a hook picker, for whoever can create hooks. Off-plan the row opens the upgrade dialog,
 * which the caller renders from `upgradeGate`.
 */
export const useHookCreation = (
  onCreated: (hook: TAgentVaultHook) => void
): {
  creation:
    | ComboboxSheetCreationConfig<TAgentVaultHook>
    | ComboboxActionCreationConfig<TAgentVaultHook>
    | undefined;
  upgradeGate: ReactNode;
} => {
  const { permission } = useProjectPermission();
  const { subscription } = useSubscription();
  const { openUpgradeGate, upgradeGate } = useUpgradeGate();
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
  if (!canCreate) return { creation: undefined, upgradeGate };
  if (!subscription.agentVaultHooks) {
    return {
      creation: {
        mode: "action",
        emptyLabel: "Create New Hook",
        formatLabel: () => "Create New Hook",
        onAction: () =>
          openUpgradeGate({ intent: AgentVaultHooksUpgradeIntent, paywallKey: "agent-vault.hooks" })
      },
      upgradeGate
    };
  }

  const attempt = attemptRef.current;

  const creation: ComboboxSheetCreationConfig<TAgentVaultHook> = {
    mode: "sheet",
    showHeader: false,
    size: "form",
    emptyLabel: "Create New Hook",
    formatLabel: () => "Create New Hook",
    isPending,
    onDismiss: requestCancel,
    renderForm: ({ initialInput, complete, cancel }) => (
      <>
        <HookForm
          initialName={initialInput}
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
  return { creation, upgradeGate };
};
