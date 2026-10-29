import { useRef, useState } from "react";

import { ComboboxDialogCreationConfig, DiscardChangesAlertDialog } from "@app/components/v3";
import { ProjectPermissionSub, useProject, useProjectPermission } from "@app/context";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { useDiscardChangesGuard } from "@app/hooks";
import { TAppConnection, TAvailableAppConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { AppConnectionForm } from "@app/pages/organization/AppConnections/AppConnectionsPage/components/AppConnectionForm";

export const useConnectionCreation = (
  app: AppConnection | undefined,
  onCreated: (connection: TAppConnection) => void
): ComboboxDialogCreationConfig<TAvailableAppConnection> | undefined => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const [isDirty, setIsDirty] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const cancelRef = useRef<VoidFunction>(() => {});
  // Bumped on dismissal so a create request that resolves after the dialog closed is ignored.
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
    !app ||
    !permission.can(
      ProjectPermissionAppConnectionActions.Create,
      ProjectPermissionSub.AppConnections
    )
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
          projectId={currentProject.id}
          projectType={currentProject.type}
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
