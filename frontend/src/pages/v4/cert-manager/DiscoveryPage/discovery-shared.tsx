import { useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DiscardChangesAlertDialog
} from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline } from "@infisical/cipher/ui/layout";
import { SecretInput } from "@infisical/cipher/ui/secret-input";
import { Tooltip } from "@infisical/cipher/ui/tooltip";
import { format } from "date-fns";

import {
  ProjectPermissionPkiCertificateInstallationActions,
  ProjectPermissionPkiDiscoveryActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { PKI_DISCOVERY_TYPE_MAP } from "@app/helpers/pkiDiscovery";
import {
  PkiCertificateFileFormat,
  PkiDiscoveryScanStatus,
  PkiDiscoveryType,
  PkiInstallationLocationType,
  PkiKeystoreStatus,
  type TPkiDiscovery,
  type TPkiInstallation
} from "@app/hooks/api/pkiDiscovery/types";

import { useProjectPermission } from "../../access/permissions";
import { failed } from "../../access/toast";
import { ProviderIcon } from "../../components/provider-icon";
import { useV4Adapter } from "../../data/adapters";

export const RESCAN_POLL_INTERVAL_MS = 3000;
export const RESCAN_POLL_TIMEOUT_MS = 2 * 60 * 1000;
export const SCAN_IN_FLIGHT_POLL_MS = 5000;
const MAX_PASSWORD_LENGTH = 1024;

export const timestamp = (value: string) => format(new Date(value), "MMM d, yyyy HH:mm");

export const isHostFileInstallation = (installation: TPkiInstallation) =>
  installation.locationType === PkiInstallationLocationType.Filesystem ||
  installation.locationType === PkiInstallationLocationType.Keystore;

export const isStoreInstallation = (installation: TPkiInstallation) =>
  installation.locationType === PkiInstallationLocationType.OsStore;

export const installationDiscoveryType = (installation: TPkiInstallation) => {
  if (isHostFileInstallation(installation)) return PkiDiscoveryType.LinuxServer;
  if (isStoreInstallation(installation)) return PkiDiscoveryType.WindowsServer;
  return PkiDiscoveryType.Network;
};

export const storePath = (installation: TPkiInstallation) => {
  const { storeLocation, storeName, thumbprint } = installation.locationDetails;
  return `Cert:\\${storeLocation ?? "LocalMachine"}\\${storeName}\\${thumbprint}`;
};

export const endpointOf = (installation: TPkiInstallation): string => {
  const { ipAddress, fqdn, port, hostIdentifier, filePath } = installation.locationDetails;
  if (isStoreInstallation(installation))
    return hostIdentifier
      ? `${hostIdentifier}:${storePath(installation)}`
      : storePath(installation);
  if (isHostFileInstallation(installation) && filePath)
    return hostIdentifier ? `${hostIdentifier}:${filePath}` : filePath;
  const host = fqdn || ipAddress;
  return host ? `${host}:${port || 443}` : "-";
};

export const installationName = (installation: TPkiInstallation) =>
  installation.name || endpointOf(installation);

export const parsePorts = (ports: string | undefined) =>
  (ports ?? "")
    .split(",")
    .map((port) => port.trim())
    .filter(Boolean);

export const canSetKeystorePassword = (installation: TPkiInstallation) => {
  if (installation.locationType !== PkiInstallationLocationType.Keystore) return false;
  const { format: fileFormat } = installation.locationDetails;
  if (fileFormat && fileFormat !== PkiCertificateFileFormat.Pkcs12) return false;
  const status = installation.metadata?.keystoreStatus;
  return (
    Boolean(installation.hasKeystorePassword) ||
    status === PkiKeystoreStatus.Locked ||
    status === PkiKeystoreStatus.PasswordFailed
  );
};

export const isScanInFlight = (status?: PkiDiscoveryScanStatus | null) =>
  status === PkiDiscoveryScanStatus.Pending || status === PkiDiscoveryScanStatus.Running;

export const useDiscoveryAccess = (projectId: string) => {
  const { permission, isPending } = useProjectPermission(projectId);
  const discovery = (action: ProjectPermissionPkiDiscoveryActions) =>
    permission.can(action, ProjectPermissionSub.PkiDiscovery);
  const installations = (action: ProjectPermissionPkiCertificateInstallationActions) =>
    permission.can(action, ProjectPermissionSub.PkiCertificateInstallations);
  return {
    isPending,
    discovery,
    installations,
    canRescan:
      installations(ProjectPermissionPkiCertificateInstallationActions.Edit) &&
      discovery(ProjectPermissionPkiDiscoveryActions.RunScan)
  };
};

export const DiscoveryStatusBadge = ({
  discovery,
  showWarnings = true
}: {
  discovery: Pick<TPkiDiscovery, "lastScanStatus" | "isActive" | "lastScanMessage">;
  showWarnings?: boolean;
}) => {
  if (!discovery.isActive)
    return (
      <Badge tone="outline" dot>
        Paused
      </Badge>
    );
  switch (discovery.lastScanStatus) {
    case PkiDiscoveryScanStatus.Running:
      return (
        <Badge tone="info" dot>
          Running
        </Badge>
      );
    case PkiDiscoveryScanStatus.Pending:
      return (
        <Badge tone="info" dot>
          Pending
        </Badge>
      );
    case PkiDiscoveryScanStatus.Completed:
      return showWarnings && discovery.lastScanMessage ? (
        <Tooltip content={discovery.lastScanMessage}>
          <Badge tone="warn" dot>
            Warning
          </Badge>
        </Tooltip>
      ) : (
        <Badge tone="ok" dot>
          Active
        </Badge>
      );
    case PkiDiscoveryScanStatus.Failed:
      return (
        <Badge tone="bad" dot>
          Error
        </Badge>
      );
    default:
      return (
        <Badge tone="outline" dot>
          Not run
        </Badge>
      );
  }
};

export const ScanStatusBadge = ({ status }: { status: PkiDiscoveryScanStatus }) => {
  const meta = {
    [PkiDiscoveryScanStatus.Running]: { tone: "info", label: "Running" },
    [PkiDiscoveryScanStatus.Pending]: { tone: "info", label: "Pending" },
    [PkiDiscoveryScanStatus.Completed]: { tone: "ok", label: "Completed" },
    [PkiDiscoveryScanStatus.Failed]: { tone: "bad", label: "Failed" }
  } as const;
  const entry = meta[status];
  return (
    <Badge tone={entry?.tone ?? "outline"} dot>
      {entry?.label ?? status}
    </Badge>
  );
};

export const KeystoreStatusBadge = ({ installation }: { installation: TPkiInstallation }) => {
  switch (installation.metadata?.keystoreStatus) {
    case PkiKeystoreStatus.Locked:
      return (
        <Badge tone="warn" dot>
          Locked
        </Badge>
      );
    case PkiKeystoreStatus.PasswordFailed:
      return (
        <Badge tone="bad" dot>
          Password failed
        </Badge>
      );
    default:
      return null;
  }
};

export const DiscoveryTypeIcon = ({ type }: { type: PkiDiscoveryType }) => {
  const { name, image } = PKI_DISCOVERY_TYPE_MAP[type];
  return image ? <ProviderIcon icon={image} alt={name} size="sm" /> : <Icon name="globe" />;
};

export const BadgeList = ({
  items,
  max = 2,
  mono
}: {
  items: readonly string[];
  max?: number;
  mono?: boolean;
}) => {
  if (!items.length) return <span>-</span>;
  const overflow = items.slice(max);
  return (
    <Inline gap={4} align="center" wrap={false}>
      {items.slice(0, max).map((item) => (
        <Badge key={item} tone="soft" mono={mono} title={item}>
          {item}
        </Badge>
      ))}
      {overflow.length > 0 && (
        <Tooltip content={overflow.join(", ")}>
          <Badge tone="outline">{`+${overflow.length}`}</Badge>
        </Tooltip>
      )}
    </Inline>
  );
};

export const DeleteDiscoveryDialog = ({
  discovery,
  onClose,
  onDeleted
}: {
  discovery?: TPkiDiscovery;
  onClose: () => void;
  onDeleted?: () => void;
}) => {
  const remove = useV4Adapter("pkiDiscovery").useDeleteDiscovery();
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open={Boolean(discovery)} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent tone="danger" confirmText={discovery?.name} pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Delete ${discovery?.name ?? "discovery job"}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            Its scan history is deleted too. You can&apos;t undo this.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async (event) => {
              event.preventDefault();
              if (!discovery) return;
              setPending(true);
              try {
                await remove.mutateAsync({ discoveryId: discovery.id });
              } catch (error) {
                failed(`Couldn't delete ${discovery.name}`, error);
                return;
              } finally {
                setPending(false);
              }
              onClose();
              onDeleted?.();
            }}
          >
            Delete job
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const DeleteInstallationDialog = ({
  installation,
  projectId,
  onClose,
  onDeleted
}: {
  installation?: TPkiInstallation;
  projectId: string;
  onClose: () => void;
  onDeleted?: () => void;
}) => {
  const remove = useV4Adapter("pkiDiscovery").useDeleteInstallation();
  const [pending, setPending] = useState(false);
  const name = installation ? installationName(installation) : "installation";
  return (
    <AlertDialog open={Boolean(installation)} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent tone="danger" confirmText="confirm" pending={pending}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Delete ${name}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            The installation record and its certificate associations are removed. You can&apos;t
            undo this.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async (event) => {
              event.preventDefault();
              if (!installation) return;
              setPending(true);
              try {
                await remove.mutateAsync({ installationId: installation.id, projectId });
              } catch (error) {
                failed(`Couldn't delete ${name}`, error);
                return;
              } finally {
                setPending(false);
              }
              onClose();
              onDeleted?.();
            }}
          >
            Delete installation
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const RenameInstallationForm = ({
  installation,
  projectId,
  onClose
}: {
  installation: TPkiInstallation;
  projectId: string;
  onClose: () => void;
}) => {
  const update = useV4Adapter("pkiDiscovery").useUpdateInstallation();
  const initial = installation.name ?? "";
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: name !== initial,
    onDiscard: onClose
  });
  const submit = async () => {
    if (name.trim().length > 255) {
      setError("Use 255 characters or fewer");
      return;
    }
    setPending(true);
    try {
      await update.mutateAsync({
        installationId: installation.id,
        projectId,
        name: name.trim() || undefined
      });
    } catch (submitError) {
      failed("Couldn't update the installation", submitError);
      return;
    } finally {
      setPending(false);
    }
    onClose();
  };
  return (
    <>
      <Dialog open onOpenChange={(open) => !open && requestDiscard()}>
        <DialogContent pending={pending}>
          <DialogHeader>
            <DialogTitle>Edit installation</DialogTitle>
            <DialogDescription>
              Rename the installation at <code>{endpointOf(installation)}</code>.
            </DialogDescription>
          </DialogHeader>
          <form
            id="edit-pki-installation"
            noValidate
            autoComplete="off"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Field
              label="Name"
              description="A friendly name shown in the installations list."
              error={error}
            >
              <Input
                value={name}
                placeholder="My web server"
                invalid={Boolean(error)}
                onChange={(event) => {
                  setName(event.target.value);
                  setError(undefined);
                }}
              />
            </Field>
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={requestDiscard} disabled={pending}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="edit-pki-installation" loading={pending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="Your new installation name will be lost."
      />
    </>
  );
};

export const EditInstallationDialog = ({
  installation,
  projectId,
  onClose
}: {
  installation?: TPkiInstallation;
  projectId: string;
  onClose: () => void;
}) =>
  installation ? (
    <RenameInstallationForm
      key={installation.id}
      installation={installation}
      projectId={projectId}
      onClose={onClose}
    />
  ) : null;

const KeystorePasswordForm = ({
  installation,
  projectId,
  onClose,
  onSaved
}: {
  installation: TPkiInstallation;
  projectId: string;
  onClose: () => void;
  onSaved?: () => void;
}) => {
  const update = useV4Adapter("pkiDiscovery").useUpdateInstallation();
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: Boolean(password),
    onDiscard: onClose
  });
  const isChange = Boolean(installation.hasKeystorePassword);
  const filePath = installation.locationDetails.filePath ?? installation.name ?? "";
  const submit = async () => {
    if (!password) return;
    setPending(true);
    try {
      await update.mutateAsync({
        installationId: installation.id,
        keystorePassword: password,
        projectId
      });
    } catch (error) {
      failed("Couldn't save the keystore password", error);
      return;
    } finally {
      setPending(false);
    }
    onSaved?.();
    onClose();
  };
  return (
    <>
      <Dialog open onOpenChange={(open) => !open && requestDiscard()}>
        <DialogContent pending={pending}>
          <DialogHeader>
            <DialogTitle>{isChange ? "Change password" : "Set password"}</DialogTitle>
            <DialogDescription>
              The password for <code>{filePath}</code>. The file is scanned again as soon as you
              save.
            </DialogDescription>
          </DialogHeader>
          <form
            id="pki-keystore-password"
            noValidate
            autoComplete="off"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <Field
              label="Keystore password"
              description="Stored encrypted and only used to open this file. Private keys aren't imported."
            >
              <SecretInput
                value={password}
                maxLength={MAX_PASSWORD_LENGTH}
                autoComplete="new-password"
                placeholder="Enter the keystore password"
                onChange={setPassword}
              />
            </Field>
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={requestDiscard} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="pki-keystore-password"
              loading={pending}
              disabledReason={password ? undefined : "Enter the keystore password"}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        description="The password you entered will be lost."
      />
    </>
  );
};

export const KeystorePasswordDialog = ({
  installation,
  projectId,
  onClose,
  onSaved
}: {
  installation?: TPkiInstallation;
  projectId: string;
  onClose: () => void;
  onSaved?: () => void;
}) =>
  installation ? (
    <KeystorePasswordForm
      key={installation.id}
      installation={installation}
      projectId={projectId}
      onClose={onClose}
      onSaved={onSaved}
    />
  ) : null;

export const passwordActionLabel = (installation: TPkiInstallation) =>
  installation.hasKeystorePassword ? "Change password" : "Set password";
