import { useRef, useState } from "react";

import { ComboboxSheetCreationConfig, DiscardChangesAlertDialog } from "@app/components/v3";
import { useDiscardChangesGuard } from "@app/hooks";
import { AgentVaultVariableType } from "@app/hooks/api/agentVault";
import { TAgentVaultVariable } from "@app/hooks/api/agentVault/types";

import { CREATE_OAUTH_VARIABLE_TITLE } from "./oauthVariableForm";
import { VariableForm } from "./VariableFormSheet";

/**
 * The picker's "Create OAuth Variable" row, which opens the variable form set to OAuth and selects the new variable
 * when it closes. An Authorize in the form creates the variable before the form closes, so closing it any way at all
 * then still selects it.
 */
export const useOAuthVariableCreation = <TOption,>(
  canCreate: boolean,
  onCreated: (variable: TAgentVaultVariable) => void
): ComboboxSheetCreationConfig<TOption> | undefined => {
  const [isDirty, setIsDirty] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isCreated, setIsCreated] = useState(false);
  const createdRef = useRef<TAgentVaultVariable | null>(null);
  // Bumped on every close, so a save that resolves after the dialog closed can't select its variable.
  const attemptRef = useRef(0);
  const closeRef = useRef<{ complete: VoidFunction; cancel: VoidFunction }>({
    complete: () => {},
    cancel: () => {}
  });

  const close = () => {
    const created = createdRef.current;
    createdRef.current = null;
    attemptRef.current += 1;
    setIsDirty(false);
    setIsCreated(false);
    if (created) {
      onCreated(created);
      closeRef.current.complete();
    } else {
      closeRef.current.cancel();
    }
  };

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: close });

  if (!canCreate) return undefined;

  const attempt = attemptRef.current;

  return {
    mode: "sheet",
    size: "form",
    title: CREATE_OAUTH_VARIABLE_TITLE,
    description:
      "Sign in once and use the sign-in as the credential of any HTTP API or MCP server.",
    emptyLabel: CREATE_OAUTH_VARIABLE_TITLE,
    formatLabel: () => CREATE_OAUTH_VARIABLE_TITLE,
    isPending,
    onDismiss: (cancel) => {
      closeRef.current.cancel = cancel;
      requestDiscard();
    },
    renderForm: ({ complete, cancel }) => {
      closeRef.current = { complete, cancel };
      return (
        <>
          <VariableForm
            isOpen
            type={AgentVaultVariableType.OAuth}
            onCreated={(variable) => {
              if (attempt !== attemptRef.current) return;
              createdRef.current = variable;
              setIsCreated(true);
            }}
            onClose={close}
            onCancel={requestDiscard}
            onPendingChange={setIsPending}
            onDirtyChange={setIsDirty}
          />
          <DiscardChangesAlertDialog
            open={isDiscardDialogOpen}
            onOpenChange={setIsDiscardDialogOpen}
            onDiscard={confirmDiscard}
            title={isCreated ? "Discard Changes?" : "Discard OAuth Variable?"}
            description="Your changes will be lost."
          />
        </>
      );
    }
  };
};
