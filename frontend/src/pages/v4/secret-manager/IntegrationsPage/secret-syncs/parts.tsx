import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { Icon } from "@infisical/cipher/ui/icon";
import { Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { Switch } from "@infisical/cipher/ui/switch";
import { StatusText } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { EraserIcon } from "lucide-react";

import { ProjectPermissionSecretSyncActions } from "@app/context/ProjectPermissionContext/types";
import { SECRET_SYNC_IMPORT_BEHAVIOR_MAP } from "@app/helpers/secretSyncs";
import { SecretSyncImportBehavior, SecretSyncStatus } from "@app/hooks/api/secretSyncs/enums";
import type { TSecretSync } from "@app/hooks/api/secretSyncs/types";
import { getSecretSyncPermissionSubject } from "@app/lib/fn/permission";

import { useProjectPermission } from "../../../access/permissions";
import { formatDateTime } from "../../../access/roles";
import { failed, saved, toast } from "../../../access/toast";
import { RESTRICTED } from "../../../access/ui";
import { useV4Adapter } from "../../../data/adapters";
import { destinationNameOf, messageOf, SYNC_STATE, syncStateOf } from "./model";

export const useSyncBlock = (projectId: string) => {
  const { permission, isPending } = useProjectPermission(projectId);
  return (sync: TSecretSync, action: ProjectPermissionSecretSyncActions) =>
    isPending || permission.can(action as never, getSecretSyncPermissionSubject(sync) as never)
      ? undefined
      : RESTRICTED;
};

export const SyncStatus = ({ sync }: { sync: TSecretSync }) => {
  const state = SYNC_STATE[syncStateOf(sync)];
  const failure = messageOf(sync.syncStatus, sync.lastSyncMessage);
  const note =
    sync.syncStatus === SecretSyncStatus.Succeeded ? sync.lastSyncMessage || undefined : undefined;
  const status = (
    <StatusText tone={state.tone} icon={state.icon} tabIndex={0}>
      {state.label}
    </StatusText>
  );
  if (!sync.lastSyncedAt && !failure && !note) return status;
  return (
    <Tooltip
      side="left"
      content={
        <Stack gap={8}>
          {sync.lastSyncedAt && (
            <span>Last synced {formatDateTime(String(sync.lastSyncedAt))}</span>
          )}
          {failure && <span style={{ whiteSpace: "pre-wrap" }}>{failure}</span>}
          {note && <span>{note}</span>}
        </Stack>
      }
    >
      {status}
    </Tooltip>
  );
};

const JOB_LABELS = {
  import: { running: "Importing secrets", failed: "Import failed", done: "Secrets imported" },
  remove: { running: "Removing secrets", failed: "Removal failed", done: "Secrets removed" }
};

const JobStatus = ({
  kind,
  status,
  message,
  at
}: {
  kind: "import" | "remove";
  status: SecretSyncStatus | null;
  message: string | null;
  at: Date | null;
}) => {
  if (!status) return null;
  const labels = JOB_LABELS[kind];
  if (status === SecretSyncStatus.Succeeded) {
    if (!at || Date.now() - new Date(at).getTime() > 15_000) return null;
    return (
      <StatusText tone="ok" icon="check-c">
        {labels.done}
      </StatusText>
    );
  }
  if (status === SecretSyncStatus.Failed)
    return (
      <Tooltip
        side="left"
        content={<span style={{ whiteSpace: "pre-wrap" }}>{messageOf(status, message)}</span>}
      >
        <StatusText tone="bad" icon="alert" tabIndex={0} data-row-interactive>
          {labels.failed}
        </StatusText>
      </Tooltip>
    );
  return <StatusText loading>{labels.running}</StatusText>;
};

export const SyncJobs = ({ sync }: { sync: TSecretSync }) => (
  <>
    <JobStatus
      kind="import"
      status={sync.importStatus}
      message={sync.lastImportMessage}
      at={sync.lastImportedAt}
    />
    <JobStatus
      kind="remove"
      status={sync.removeStatus}
      message={sync.lastRemoveMessage}
      at={sync.lastRemovedAt}
    />
  </>
);

export const AutoSyncOff = () => (
  <Tooltip content="Changes to the source aren't synced until you turn auto-sync back on.">
    <StatusText icon="x" tabIndex={0} data-row-interactive>
      Auto-sync off
    </StatusText>
  </Tooltip>
);

export type SyncDialogKind = "import" | "remove" | "delete";

export const useSyncActions = (projectId: string) => {
  const adapter = useV4Adapter("secrets");
  const trigger = adapter.useTriggerSecretSync();
  const update = adapter.useUpdateSecretSync();
  const { data: options } = adapter.useSecretSyncOptions();
  const blockFor = useSyncBlock(projectId);
  const optionOf = (sync: TSecretSync) =>
    options?.find((option) => option.destination === sync.destination);

  const triggerSync = async (sync: TSecretSync) => {
    try {
      await trigger.mutateAsync({ syncId: sync.id, destination: sync.destination, projectId });
    } catch (error) {
      failed(`Couldn't start a sync for ${sync.name}`, error);
      return;
    }
    saved(`Sync started for ${sync.name}`);
  };

  const toggleAutoSync = async (sync: TSecretSync) => {
    const isAutoSyncEnabled = !sync.isAutoSyncEnabled;
    try {
      await update.mutateAsync({
        syncId: sync.id,
        destination: sync.destination,
        isAutoSyncEnabled,
        projectId
      });
    } catch (error) {
      failed(`Couldn't ${isAutoSyncEnabled ? "turn on" : "turn off"} auto-sync`, error);
      return;
    }
    saved(`Auto-sync ${isAutoSyncEnabled ? "on" : "off"} for ${sync.name}`);
  };

  const importBlock = (sync: TSecretSync) =>
    optionOf(sync) && !optionOf(sync)?.canImportSecrets
      ? `${destinationNameOf(sync.destination)} doesn't support importing secrets`
      : blockFor(sync, ProjectPermissionSecretSyncActions.ImportSecrets);

  const removeBlock = (sync: TSecretSync) =>
    optionOf(sync) && !optionOf(sync)?.canRemoveSecretsOnDeletion
      ? `${destinationNameOf(sync.destination)} doesn't support removing synced secrets`
      : blockFor(sync, ProjectPermissionSecretSyncActions.RemoveSecrets);

  return {
    triggerSync,
    toggleAutoSync,
    blockFor,
    importBlock,
    removeBlock,
    canRemoveOnDelete: (sync: TSecretSync) => Boolean(optionOf(sync)?.canRemoveSecretsOnDeletion)
  };
};

export type SyncActions = ReturnType<typeof useSyncActions>;

export const copySyncId = (sync: TSecretSync) => {
  navigator.clipboard?.writeText(sync.id);
  toast({ tone: "ok", title: "Sync ID copied to clipboard" });
};

export const SyncMenuItems = ({
  sync,
  actions,
  onOpen
}: {
  sync: TSecretSync;
  actions: SyncActions;
  onOpen: (kind: SyncDialogKind) => void;
}) => (
  <>
    <DropdownMenuItem onSelect={() => copySyncId(sync)}>
      <Icon name="copy" />
      Copy sync ID
    </DropdownMenuItem>
    <DropdownMenuItem disabledReason={actions.importBlock(sync)} onSelect={() => onOpen("import")}>
      <Icon name="download" />
      Import secrets
    </DropdownMenuItem>
    <DropdownMenuItem disabledReason={actions.removeBlock(sync)} onSelect={() => onOpen("remove")}>
      <Icon icon={EraserIcon} />
      Remove synced secrets
    </DropdownMenuItem>
    <DropdownMenuItem
      disabledReason={actions.blockFor(sync, ProjectPermissionSecretSyncActions.Edit)}
      onSelect={() => actions.toggleAutoSync(sync)}
    >
      <Icon name={sync.isAutoSyncEnabled ? "x" : "sync"} />
      {sync.isAutoSyncEnabled ? "Turn off auto-sync" : "Turn on auto-sync"}
    </DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem
      variant="destructive"
      disabledReason={actions.blockFor(sync, ProjectPermissionSecretSyncActions.Delete)}
      onSelect={() => onOpen("delete")}
    >
      <Icon name="trash" />
      Delete sync
    </DropdownMenuItem>
  </>
);

const ImportDialog = ({
  sync,
  projectId,
  onClose
}: {
  sync: TSecretSync;
  projectId: string;
  onClose: () => void;
}) => {
  const run = useV4Adapter("secrets").useImportSecretSyncSecrets();
  const [behavior, setBehavior] = useState<SecretSyncImportBehavior>();
  const [pending, setPending] = useState(false);
  const name = destinationNameOf(sync.destination);
  const submit = async () => {
    if (!behavior) return;
    setPending(true);
    try {
      await run.mutateAsync({
        syncId: sync.id,
        destination: sync.destination,
        importBehavior: behavior,
        projectId
      });
    } catch (error) {
      failed(`Couldn't start importing from ${name}`, error);
      setPending(false);
      return;
    }
    saved(`Importing secrets from ${name}`);
    onClose();
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Import secrets from ${name}?`}</DialogTitle>
          <DialogDescription>
            Secrets in this destination are copied into the sync&apos;s source folder.
          </DialogDescription>
        </DialogHeader>
        <Select
          label="Import behavior"
          aria-label="Import behavior"
          placeholder="Select a behavior..."
          value={behavior ?? ""}
          onValueChange={(value) => setBehavior(value as SecretSyncImportBehavior)}
          options={Object.values(SecretSyncImportBehavior).map((value) => {
            const details = SECRET_SYNC_IMPORT_BEHAVIOR_MAP[value](name);
            return {
              value,
              label:
                value === SecretSyncImportBehavior.PrioritizeSource
                  ? "Prioritize Infisical values"
                  : `Prioritize ${name} values`,
              description: details.description
            };
          })}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={pending}
            disabledReason={behavior ? undefined : "Select an import behavior"}
            onClick={submit}
          >
            Import secrets
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const RemoveDialog = ({
  sync,
  projectId,
  onClose
}: {
  sync: TSecretSync;
  projectId: string;
  onClose: () => void;
}) => {
  const run = useV4Adapter("secrets").useRemoveSecretSyncSecrets();
  const [pending, setPending] = useState(false);
  const name = destinationNameOf(sync.destination);
  const submit = async () => {
    setPending(true);
    try {
      await run.mutateAsync({ syncId: sync.id, destination: sync.destination, projectId });
    } catch (error) {
      failed(`Couldn't start removing secrets from ${name}`, error);
      setPending(false);
      return;
    }
    saved(`Removing synced secrets from ${name}`);
    onClose();
  };
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent tone="danger" icon="alert" pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Remove synced secrets from ${name}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            Every secret this sync wrote to the destination is deleted there. Secrets in Infisical
            stay as they are.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            loading={pending}
            onClick={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            Remove secrets
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const DeleteDialog = ({
  sync,
  projectId,
  canRemoveSecrets,
  onClose,
  onDeleted
}: {
  sync: TSecretSync;
  projectId: string;
  canRemoveSecrets: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}) => {
  const run = useV4Adapter("secrets").useDeleteSecretSync();
  const [removeSecrets, setRemoveSecrets] = useState(false);
  const [pending, setPending] = useState(false);
  const name = destinationNameOf(sync.destination);
  const submit = async () => {
    setPending(true);
    try {
      await run.mutateAsync({
        syncId: sync.id,
        destination: sync.destination,
        removeSecrets,
        projectId
      });
    } catch (error) {
      failed(`Couldn't delete ${sync.name}`, error);
      setPending(false);
      return;
    }
    saved(`Deleted ${sync.name}`);
    onClose();
    onDeleted?.();
  };
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent tone="danger" confirmText={sync.name} pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Delete ${sync.name}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            Secrets stop syncing to {name}. You can&apos;t undo this.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {canRemoveSecrets && (
          <Switch
            layout="row"
            label="Remove synced secrets"
            description={`Also delete the secrets this sync wrote to ${name}.`}
            checked={removeSecrets}
            onCheckedChange={setRemoveSecrets}
          />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            loading={pending}
            onClick={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            Delete sync
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const SyncDialog = ({
  dialog,
  projectId,
  actions,
  onClose,
  onDeleted
}: {
  dialog?: { kind: SyncDialogKind; sync: TSecretSync };
  projectId: string;
  actions: SyncActions;
  onClose: () => void;
  onDeleted?: () => void;
}) => {
  if (!dialog) return null;
  const { kind, sync } = dialog;
  if (kind === "import")
    return <ImportDialog sync={sync} projectId={projectId} onClose={onClose} />;
  if (kind === "remove")
    return <RemoveDialog sync={sync} projectId={projectId} onClose={onClose} />;
  return (
    <DeleteDialog
      sync={sync}
      projectId={projectId}
      canRemoveSecrets={actions.canRemoveOnDelete(sync)}
      onClose={onClose}
      onDeleted={onDeleted}
    />
  );
};
