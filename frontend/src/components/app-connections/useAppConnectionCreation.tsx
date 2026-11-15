import { ReactNode, useEffect, useRef, useState } from "react";
import { ChevronRightIcon } from "lucide-react";

import {
  Button,
  ComboboxDialogCreationConfig,
  DialogFooter,
  DiscardChangesAlertDialog,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle
} from "@app/components/v3";
import { ProviderIcon } from "@app/components/v3/platform/ProviderIcon";
import { ProjectPermissionSub, useProject, useProjectPermission } from "@app/context";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { useDiscardChangesGuard } from "@app/hooks";
import { TAppConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { AppConnectionForm } from "@app/pages/organization/AppConnections/AppConnectionsPage/components/AppConnectionForm";

type Props = {
  apps: AppConnection[];
  onCreated: (connection: TAppConnection) => void;
  onOpen?: VoidFunction;
  onClose?: VoidFunction;
};

const CreationLifecycle = ({
  onOpen,
  onClose,
  children
}: {
  onOpen: VoidFunction;
  onClose: VoidFunction;
  children: ReactNode;
}) => {
  const callbacksRef = useRef({ onOpen, onClose });
  callbacksRef.current = { onOpen, onClose };

  useEffect(() => {
    callbacksRef.current.onOpen();
    return () => callbacksRef.current.onClose();
  }, []);

  return children;
};

export const useAppConnectionCreation = <TOption,>({
  apps,
  onCreated,
  onOpen,
  onClose
}: Props): ComboboxDialogCreationConfig<TOption> | undefined => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const [selectedApp, setSelectedApp] = useState<AppConnection | null>(null);
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
    !apps.length ||
    !permission.can(
      ProjectPermissionAppConnectionActions.Create,
      ProjectPermissionSub.AppConnections
    )
  )
    return undefined;

  const app = apps.length === 1 ? apps[0] : selectedApp;
  const label =
    apps.length === 1
      ? `Create ${APP_CONNECTION_MAP[apps[0]].name} Connection`
      : "Create Connection";
  const attempt = attemptRef.current;

  return {
    mode: "dialog",
    title: app ? `Create ${APP_CONNECTION_MAP[app].name} Connection` : label,
    description: app
      ? "The new connection is selected once it is created."
      : "Choose the type of connection to create.",
    emptyLabel: label,
    formatLabel: () => label,
    isPending,
    onDismiss: requestCancel,
    renderForm: ({ complete, cancel }) => (
      <CreationLifecycle
        onOpen={() => onOpen?.()}
        onClose={() => {
          setSelectedApp(null);
          setIsDirty(false);
          onClose?.();
        }}
      >
        {app ? (
          <AppConnectionForm
            key={app}
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
        ) : (
          <>
            <ItemGroup>
              {apps.map((option) => {
                const { name, image, description } = APP_CONNECTION_MAP[option];
                return (
                  <Item
                    key={option}
                    asChild
                    variant="outline"
                    className="cursor-pointer text-left hover:bg-foreground/5"
                  >
                    <button type="button" onClick={() => setSelectedApp(option)}>
                      <ItemMedia>
                        <ProviderIcon
                          icon={image}
                          alt={`${name} logo`}
                          className="size-6 object-contain"
                        />
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>{name}</ItemTitle>
                        {description && <ItemDescription>{description}</ItemDescription>}
                      </ItemContent>
                      <ItemActions>
                        <ChevronRightIcon className="size-4 text-muted" />
                      </ItemActions>
                    </button>
                  </Item>
                );
              })}
            </ItemGroup>
            <DialogFooter>
              <Button variant="ghost" onClick={() => requestCancel(cancel)}>
                Cancel
              </Button>
            </DialogFooter>
          </>
        )}
        <DiscardChangesAlertDialog
          open={isDiscardDialogOpen}
          onOpenChange={setIsDiscardDialogOpen}
          onDiscard={confirmDiscard}
          title="Discard Connection Setup?"
          description="Your progress configuring this connection will be lost."
        />
      </CreationLifecycle>
    )
  };
};
