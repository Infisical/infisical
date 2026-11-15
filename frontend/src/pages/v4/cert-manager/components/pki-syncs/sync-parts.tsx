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
import { Combobox } from "@infisical/cipher/ui/combobox";
import { DropdownMenuItem, DropdownMenuSeparator } from "@infisical/cipher/ui/dropdown-menu";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Stack } from "@infisical/cipher/ui/layout";
import { StatusText } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { EraserIcon, ToggleLeftIcon, ToggleRightIcon } from "lucide-react";

import { getPaloAltoNetworksProfileLabel, getPkiSyncFailureMessage } from "@app/helpers/pkiSyncs";
import { PkiSync, PkiSyncStatus } from "@app/hooks/api/pkiSyncs/enums";
import type {
  TPaloAltoNetworksSslTlsProfilePkiSync,
  TPkiSync,
  TPkiSyncRemovalOptions
} from "@app/hooks/api/pkiSyncs/types";

import { formatDateTime } from "../../../access/roles";
import { failed, saved, toast } from "../../../access/toast";
import { RESTRICTED } from "../../../access/ui";
import { useV4Adapter } from "../../../data/adapters";
import {
  destinationNameOf,
  type PkiSyncPermissions,
  usePkiSyncOption,
  usePkiSyncPermissions
} from "./shared";

type SyncState = PkiSyncStatus | "never";

export const SYNC_STATE: Record<
  SyncState,
  {
    label: string;
    tone: "neutral" | "ok" | "bad";
    icon: "clock" | "check-c" | "alert";
    order: number;
  }
> = {
  [PkiSyncStatus.Failed]: { label: "Failed to sync", tone: "bad", icon: "alert", order: 0 },
  [PkiSyncStatus.Pending]: { label: "Queued", tone: "neutral", icon: "clock", order: 1 },
  [PkiSyncStatus.Running]: { label: "Syncing", tone: "neutral", icon: "clock", order: 1 },
  [PkiSyncStatus.Succeeded]: { label: "Synced", tone: "ok", icon: "check-c", order: 2 },
  never: { label: "Not synced", tone: "neutral", icon: "clock", order: 3 }
};

export const syncStateOf = (sync: TPkiSync): SyncState => sync.syncStatus ?? "never";

export const SyncStatus = ({ sync }: { sync: TPkiSync }) => {
  const state = SYNC_STATE[syncStateOf(sync)];
  const failure = getPkiSyncFailureMessage(sync.syncStatus, sync.lastSyncMessage);
  const running = sync.syncStatus === PkiSyncStatus.Running;
  const status = running ? (
    <StatusText loading tabIndex={0}>
      {state.label}
    </StatusText>
  ) : (
    <StatusText tone={state.tone} icon={state.icon} tabIndex={0}>
      {state.label}
    </StatusText>
  );
  const settled =
    sync.syncStatus === PkiSyncStatus.Succeeded || sync.syncStatus === PkiSyncStatus.Failed;
  if (!sync.syncStatus) {
    return (
      <Tooltip content="This sync hasn't run yet, so nothing has been pushed to the destination.">
        {status}
      </Tooltip>
    );
  }
  if (!settled || (!sync.lastSyncedAt && !failure)) return status;
  return (
    <Tooltip
      side="left"
      content={
        <Stack gap={8}>
          {sync.lastSyncedAt && (
            <span>Last synced {formatDateTime(String(sync.lastSyncedAt))}</span>
          )}
          {failure && <span style={{ whiteSpace: "pre-wrap" }}>{failure}</span>}
        </Stack>
      }
    >
      {status}
    </Tooltip>
  );
};

const JOB_LABELS = {
  import: {
    running: "Importing certificates",
    failed: "Import failed",
    done: "Certificates imported"
  },
  remove: {
    running: "Removing certificates",
    failed: "Removal failed",
    done: "Certificates removed"
  }
};

const JobStatus = ({
  kind,
  status,
  message,
  at
}: {
  kind: "import" | "remove";
  status: PkiSyncStatus | null;
  message: string | null;
  at: string | null;
}) => {
  if (!status) return null;
  const labels = JOB_LABELS[kind];
  if (status === PkiSyncStatus.Succeeded) {
    if (!at || Date.now() - new Date(at).getTime() > 15_000) return null;
    return (
      <StatusText tone="ok" icon="check-c">
        {labels.done}
      </StatusText>
    );
  }
  if (status === PkiSyncStatus.Failed)
    return (
      <Tooltip
        side="left"
        content={
          <span style={{ whiteSpace: "pre-wrap" }}>
            {getPkiSyncFailureMessage(status, message) ?? labels.failed}
          </span>
        }
      >
        <StatusText tone="bad" icon="alert" tabIndex={0} data-row-interactive>
          {labels.failed}
        </StatusText>
      </Tooltip>
    );
  return <StatusText loading>{labels.running}</StatusText>;
};

export const SyncJobs = ({ sync, canImport }: { sync: TPkiSync; canImport?: boolean }) => (
  <>
    {canImport !== false && (
      <JobStatus
        kind="import"
        status={sync.importStatus}
        message={sync.lastImportMessage}
        at={sync.lastImportedAt}
      />
    )}
    <JobStatus
      kind="remove"
      status={sync.removeStatus}
      message={sync.lastRemoveMessage}
      at={sync.lastRemovedAt}
    />
  </>
);

export const AutoSyncOff = () => (
  <Tooltip content="Certificate changes aren't synced to the destination until you turn auto-sync back on.">
    <StatusText icon="x" tabIndex={0} data-row-interactive>
      Auto-sync off
    </StatusText>
  </Tooltip>
);

export const usePkiSyncActions = () => {
  const adapter = useV4Adapter("pkiSyncs");
  const trigger = adapter.useTriggerSync();
  const update = adapter.useUpdateSync();

  const triggerSync = async (sync: TPkiSync) => {
    try {
      await trigger.mutateAsync({
        syncId: sync.id,
        destination: sync.destination,
        projectId: sync.projectId
      });
    } catch (error) {
      failed(`Couldn't start a sync for ${sync.name}`, error);
      return;
    }
    saved(`Sync queued for ${sync.name}`);
  };

  const toggleAutoSync = async (sync: TPkiSync) => {
    const isAutoSyncEnabled = !sync.isAutoSyncEnabled;
    try {
      await update.mutateAsync({
        syncId: sync.id,
        projectId: sync.projectId,
        destination: sync.destination,
        isAutoSyncEnabled
      });
    } catch (error) {
      failed(`Couldn't turn ${isAutoSyncEnabled ? "on" : "off"} auto-sync`, error);
      return;
    }
    saved(`Auto-sync ${isAutoSyncEnabled ? "on" : "off"} for ${sync.name}`);
  };

  return { triggerSync, toggleAutoSync, isToggling: update.isPending };
};

export type PkiSyncDialogKind = "import" | "remove" | "delete";

export const PkiSyncMenuItems = ({
  sync,
  permissions,
  onOpen,
  onToggleAutoSync,
  onCopyId
}: {
  sync: TPkiSync;
  permissions: PkiSyncPermissions;
  onOpen: (kind: PkiSyncDialogKind) => void;
  onToggleAutoSync: () => void;
  onCopyId: () => void;
}) => {
  const { syncOption } = usePkiSyncOption(sync.destination);
  const name = destinationNameOf(sync.destination);
  return (
    <>
      <DropdownMenuItem onSelect={onCopyId}>
        <Icon name="copy" />
        Copy sync ID
      </DropdownMenuItem>
      {syncOption?.canImportCertificates && (
        <DropdownMenuItem
          disabledReason={permissions.canImportCertificates ? undefined : RESTRICTED}
          onSelect={() => onOpen("import")}
        >
          <Icon name="download" />
          Import certificates from {name}
        </DropdownMenuItem>
      )}
      {syncOption?.canRemoveCertificates && (
        <DropdownMenuItem
          disabledReason={permissions.canRemoveCertificates ? undefined : RESTRICTED}
          onSelect={() => onOpen("remove")}
        >
          <Icon icon={EraserIcon} />
          Remove synced certificates
        </DropdownMenuItem>
      )}
      <DropdownMenuItem
        disabledReason={permissions.canEdit ? undefined : RESTRICTED}
        onSelect={onToggleAutoSync}
      >
        <Icon icon={sync.isAutoSyncEnabled ? ToggleLeftIcon : ToggleRightIcon} />
        {sync.isAutoSyncEnabled ? "Turn off auto-sync" : "Turn on auto-sync"}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        disabledReason={permissions.canDelete ? undefined : RESTRICTED}
        onSelect={() => onOpen("delete")}
      >
        <Icon name="trash" />
        Delete sync
      </DropdownMenuItem>
    </>
  );
};

export const hasPkiSyncRemovalOptions = (destination: PkiSync) =>
  destination === PkiSync.PaloAltoNetworksSslTlsProfile;

export const arePkiSyncRemovalOptionsComplete = (
  destination: PkiSync,
  { remainingCertificateCount }: { remainingCertificateCount: number },
  value: TPkiSyncRemovalOptions
) =>
  destination !== PkiSync.PaloAltoNetworksSslTlsProfile ||
  remainingCertificateCount > 0 ||
  Boolean(value.replacementCertificateName);

const PaloAltoReplacementField = ({
  sync,
  value,
  onChange
}: {
  sync: TPaloAltoNetworksSslTlsProfilePkiSync;
  value: TPkiSyncRemovalOptions;
  onChange: (value: TPkiSyncRemovalOptions) => void;
}) => {
  const adapter = useV4Adapter("pkiSyncs");
  const { destinationConfig } = sync;
  const { data: certificates = [], isPending } = adapter.usePaloAltoCertificates(
    sync.connection.id,
    destinationConfig.template
  );
  const { data: syncCertificates, isPending: syncPending } = adapter.useSyncCertificates(sync.id, {
    limit: 100
  });
  const syncNames = new Set(
    syncCertificates?.certificates.map((entry) => entry.externalIdentifier)
  );
  const options = certificates.filter(
    (certificate) =>
      (certificate.vsys === null ||
        certificate.vsys === destinationConfig.sslTlsServiceProfileVsys) &&
      !(certificate.vsys === null && syncNames.has(certificate.name))
  );
  return (
    <Field
      label="Replacement certificate"
      description="The SSL/TLS service profile can't be left without a certificate. Choose the one it should switch to."
    >
      <Combobox
        label="Replacement certificate"
        loading={isPending || syncPending}
        value={(value.replacementCertificateName as string | undefined) ?? ""}
        placeholder="Select a certificate on the device"
        options={options.map((certificate) => ({
          value: certificate.name,
          label: getPaloAltoNetworksProfileLabel(certificate)
        }))}
        onValueChange={(next) =>
          onChange({ ...value, replacementCertificateName: next || undefined })
        }
      />
    </Field>
  );
};

export const PkiSyncRemovalOptionsFields = ({
  sync,
  value,
  onChange
}: {
  sync: TPkiSync;
  value: TPkiSyncRemovalOptions;
  onChange: (value: TPkiSyncRemovalOptions) => void;
}) =>
  sync.destination === PkiSync.PaloAltoNetworksSslTlsProfile ? (
    <PaloAltoReplacementField sync={sync} value={value} onChange={onChange} />
  ) : null;

export const PkiSyncDialog = ({
  dialog,
  onClose,
  onDeleted
}: {
  dialog?: { kind: PkiSyncDialogKind; sync: TPkiSync };
  onClose: () => void;
  onDeleted?: () => void;
}) => {
  const adapter = useV4Adapter("pkiSyncs");
  const remove = adapter.useDeleteSync();
  const importCertificates = adapter.useTriggerImport();
  const removeCertificates = adapter.useTriggerRemove();
  const [pending, setPending] = useState(false);
  const [removalOptions, setRemovalOptions] = useState<TPkiSyncRemovalOptions>({});
  const sync = dialog?.sync;
  const name = sync ? destinationNameOf(sync.destination) : "";
  const close = () => {
    setRemovalOptions({});
    onClose();
  };

  const run = async (action: () => Promise<unknown>, failure: string, success: string) => {
    setPending(true);
    try {
      await action();
    } catch (error) {
      failed(failure, error);
      return false;
    } finally {
      setPending(false);
    }
    saved(success);
    close();
    return true;
  };

  return (
    <>
      <AlertDialog open={dialog?.kind === "delete"} onOpenChange={(next) => !next && close()}>
        <AlertDialogContent tone="danger" confirmText={sync?.name} pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Delete ${sync?.name ?? "sync"}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the {name} certificate sync. You can&apos;t undo this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={async (event) => {
                event.preventDefault();
                if (!sync) return;
                const done = await run(
                  () =>
                    remove.mutateAsync({
                      syncId: sync.id,
                      projectId: sync.projectId,
                      destination: sync.destination
                    }),
                  `Couldn't delete ${sync.name}`,
                  `${sync.name} deleted`
                );
                if (done) onDeleted?.();
              }}
            >
              Delete sync
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={dialog?.kind === "import"} onOpenChange={(next) => !next && close()}>
        <AlertDialogContent pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Import certificates from {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Infisical retrieves the certificates in {name} and makes them available here. Only
              certificates that aren&apos;t imported yet are processed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (!sync) return;
                run(
                  () =>
                    importCertificates.mutateAsync({
                      syncId: sync.id,
                      destination: sync.destination,
                      projectId: sync.projectId
                    }),
                  `Couldn't import certificates from ${name}`,
                  `Certificate import started for ${sync.name}`
                );
              }}
            >
              Import certificates
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={dialog?.kind === "remove"} onOpenChange={(next) => !next && close()}>
        <AlertDialogContent tone="danger" pending={pending}>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove synced certificates from {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes the certificates the sync added to {name}. Certificates added there any
              other way stay.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {sync && hasPkiSyncRemovalOptions(sync.destination) && (
            <PkiSyncRemovalOptionsFields
              sync={sync}
              value={removalOptions}
              onChange={setRemovalOptions}
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                if (!sync) return;
                run(
                  () =>
                    removeCertificates.mutateAsync({
                      syncId: sync.id,
                      destination: sync.destination,
                      projectId: sync.projectId,
                      ...(hasPkiSyncRemovalOptions(sync.destination) ? { removalOptions } : {})
                    }),
                  `Couldn't remove certificates from ${name}`,
                  `Certificate removal started for ${sync.name}`
                );
              }}
            >
              Remove certificates
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export const copySyncId = (sync: TPkiSync) => {
  navigator.clipboard?.writeText(sync.id).catch(() => undefined);
  toast({ title: "Sync ID copied" });
};

export { usePkiSyncPermissions };
