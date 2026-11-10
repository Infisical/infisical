import { useRef, useState } from "react";

import { ComboboxDialogCreationConfig, DiscardChangesAlertDialog } from "@app/components/v3";
import { OrgPermissionSubjects, useOrgPermission } from "@app/context";
import { OrgPermissionAppConnectionActions } from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { useDiscardChangesGuard } from "@app/hooks";
import { TAppConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionForm } from "./AppConnectionForm";

// An organization-level counterpart of the project pickers' inline "Create Connection" row
export const useOrgConnectionCreation = <TOption,>(
  app: AppConnection,
  onCreated: (connection: TAppConnection) => void
): ComboboxDialogCreationConfig<TOption> | undefined => {
  const { permission } = useOrgPermission();
  const [isDirty, setIsDirty] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const cancelRef = useRef<VoidFunction>(() => {});
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

  if (
    !permission.can(OrgPermissionAppConnectionActions.Create, OrgPermissionSubjects.AppConnections)
  )
    return undefined;

  const label = `Create ${APP_CONNECTION_MAP[app].name} Connection`;
  const attempt = attemptRef.current;

  return {
    mode: "dialog",
    title: label,
    description: "The new connection is selected once it is created.",
    emptyLabel: label,
    formatLabel: () => label,
    isPending,
    onDismiss: requestCancel,
    renderForm: ({ complete, cancel }) => (
      <>
        <AppConnectionForm
          app={app}
          layout="dialog"
          onDirtyChange={setIsDirty}
          onPendingChange={setIsPending}
          onComplete={(connection) => {
            if (attempt !== attemptRef.current) return;
            setIsDirty(false);
            setIsDiscardDialogOpen(false);
            onCreated(connection);
            complete();
          }}
          onCancel={() => requestCancel(cancel)}
        />
        <DiscardChangesAlertDialog
          open={isDiscardDialogOpen}
          onOpenChange={setIsDiscardDialogOpen}
          onDiscard={confirmDiscard}
          title="Discard Connection Setup?"
          description="Your progress configuring this connection will be lost."
        />
      </>
    )
  };
};
