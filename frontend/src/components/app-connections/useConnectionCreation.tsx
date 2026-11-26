import { ComponentProps, useRef, useState } from "react";

import { ComboboxDialogCreationConfig, DiscardChangesAlertDialog } from "@app/components/v3";
import { ProjectPermissionSub, useProject, useProjectPermission } from "@app/context";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP, isFederatedAppConnection } from "@app/helpers/appConnections";
import { useDiscardChangesGuard } from "@app/hooks";
import { TAppConnection, TAvailableAppConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { AppConnectionForm } from "@app/pages/organization/AppConnections/AppConnectionsPage/components/AppConnectionForm";
import { AppConnectionsSelect } from "@app/pages/organization/AppConnections/AppConnectionsPage/components/AppConnectionList";

// Shared by the project and organization pickers; each supplies its permission check and form scope
export const useConnectionCreationDialog = <TOption,>(
  appOrApps: AppConnection | AppConnection[] | undefined,
  canCreate: boolean,
  formProps: Pick<ComponentProps<typeof AppConnectionForm>, "projectId" | "projectType">,
  onCreated: (connection: TAppConnection) => void
): ComboboxDialogCreationConfig<TOption> | undefined => {
  const [isDirty, setIsDirty] = useState(false);
  const [isPending, setIsPending] = useState(false);
  // A federated connection stays in the dialog after create and is selected only once it verifies: the provider
  // can only trust it once it exists, and selecting it earlier runs lookups (such as GCP project discovery) that
  // fail until then and are not refetched
  const [createdConnection, setCreatedConnection] = useState<TAppConnection | null>(null);
  const [chosenApp, setChosenApp] = useState<AppConnection | null>(null);
  const cancelRef = useRef<VoidFunction>(() => {});
  // Bumped on dismissal so a create request that resolves after the dialog closed is ignored.
  const attemptRef = useRef(0);

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({
      isDirty,
      onDiscard: () => {
        attemptRef.current += 1;
        setIsDirty(false);
        setCreatedConnection(null);
        setChosenApp(null);
        cancelRef.current();
      }
    });

  const requestCancel = (cancel: VoidFunction) => {
    cancelRef.current = cancel;
    requestDiscard();
  };

  const apps = [appOrApps ?? []].flat();
  if (!apps.length || !canCreate) return undefined;

  const app = apps.length === 1 ? apps[0] : chosenApp;
  const label =
    apps.length === 1
      ? `Create ${APP_CONNECTION_MAP[apps[0]].name} Connection`
      : "Create Connection";
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
        {/* eslint-disable-next-line no-nested-ternary */}
        {!app ? (
          <div className="max-h-[60vh] overflow-y-auto px-6 pb-6">
            <AppConnectionsSelect apps={apps} onSelect={setChosenApp} />
          </div>
        ) : createdConnection ? (
          <AppConnectionForm
            appConnection={createdConnection}
            isNewConnection
            layout="dialog"
            onDirtyChange={setIsDirty}
            onPendingChange={setIsPending}
            onComplete={(connection) => {
              if (attempt !== attemptRef.current) return;
              setCreatedConnection(null);
              setChosenApp(null);
              onCreated(connection);
              complete();
            }}
            onCancel={() => requestCancel(cancel)}
          />
        ) : (
          <AppConnectionForm
            app={app}
            layout="dialog"
            {...formProps}
            onDirtyChange={setIsDirty}
            onPendingChange={setIsPending}
            onComplete={(connection) => {
              if (attempt !== attemptRef.current) return;
              setIsDirty(false);
              setIsDiscardDialogOpen(false);
              if (isFederatedAppConnection(connection)) {
                setCreatedConnection(connection);
                return;
              }
              setChosenApp(null);
              onCreated(connection);
              complete();
            }}
            onCancel={() => requestCancel(cancel)}
          />
        )}
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

export const useConnectionCreation = (
  app: AppConnection | undefined,
  onCreated: (connection: TAppConnection) => void
) => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  return useConnectionCreationDialog<TAvailableAppConnection>(
    app,
    permission.can(
      ProjectPermissionAppConnectionActions.Create,
      ProjectPermissionSub.AppConnections
    ),
    { projectId: currentProject.id, projectType: currentProject.type },
    onCreated
  );
};
