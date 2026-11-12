import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { EyeOffIcon, HardDriveIcon, RotateCcwIcon, ServerCogIcon } from "lucide-react";

import { Alert } from "@app/components/v4/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Icon } from "@app/components/v4/ui/icon";
import { Stack } from "@app/components/v4/ui/layout";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetSubheader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Skeleton } from "@app/components/v4/ui/skeleton";
import { Spinner } from "@app/components/v4/ui/spinner";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { useV4Adapter } from "../../../../data/adapters";
import type { Secret, SecretVersion } from "../../secrets-model";
import { ActionButton } from "../overview-cells";

import flowStyles from "../flows/flows.module.css";
import styles from "./row-actions.module.css";

const mask = "••••••••••••••••••••";
const HIDDEN_VALUE = "<hidden-by-infisical>";
const actorIcons = { user: undefined, identity: HardDriveIcon, platform: ServerCogIcon };
const actorName = (version: SecretVersion) =>
  version.actorType === "platform" ? "System" : version.actor;

function VersionItem({
  secretId,
  version,
  current,
  last,
  canRead,
  editBlock,
  managed,
  onCopy,
  onRestore,
  onRedact
}: {
  secretId: string;
  version: SecretVersion;
  current: boolean;
  last: boolean;
  canRead: boolean;
  editBlock?: string;
  managed: boolean;
  onCopy: (value: string) => void;
  onRestore: (value: string) => void;
  onRedact: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [confirm, setConfirm] = useState<"restore" | "redact">();
  const [wanted, setWanted] = useState(false);
  const copyRequested = useRef(false);
  const restoreSubmitted = useRef(false);
  const [retrying, setRetrying] = useState(false);
  const hidden = Boolean(version.secretValueHidden);
  const {
    data: loaded,
    isPending: valuePending,
    error: valueError,
    refetch
  } = useV4Adapter("secrets").useSecretVersionValue(
    { secretId, version: version.version },
    {
      enabled:
        canRead && !hidden && !version.redacted && (wanted || visible || confirm === "restore")
    }
  );
  const value = loaded ?? "";
  const hiddenValue = hidden || loaded === HIDDEN_VALUE;
  const canRestore =
    canRead &&
    !editBlock &&
    !managed &&
    !current &&
    !version.redacted &&
    !hiddenValue &&
    !retrying &&
    !valuePending &&
    !valueError &&
    loaded !== undefined;
  useEffect(() => {
    if (!copyRequested.current || loaded === undefined) return;
    copyRequested.current = false;
    if (loaded !== HIDDEN_VALUE) onCopy(loaded);
  }, [loaded]);
  return (
    <li className={styles.version} data-last={last || undefined}>
      <span className={styles.versionDot} data-current={current || undefined} aria-hidden />
      <div className={styles.versionBody}>
        <div className={styles.versionHead}>
          <span className={styles.versionMeta}>
            <span className={styles.versionNumber} data-current={current || undefined}>
              {`v${version.version}`}
            </span>
            {current && <Badge tone="info">Current</Badge>}
            {version.redacted && (
              <Badge tone="outline">
                <Icon icon={EyeOffIcon} size={12} />
                Redacted
              </Badge>
            )}
            <span className={styles.versionTime}>
              <Icon name="clock" size={12} />
              {format(new Date(version.createdAt), "MMM d, yyyy, h:mm a")}
            </span>
          </span>
          {canRead && (
            <span className={styles.versionActions}>
              {!version.redacted && !hidden && (
                <>
                  <ActionButton
                    label="Copy value"
                    name="copy"
                    onClick={() => {
                      if (loaded !== undefined) {
                        if (loaded !== HIDDEN_VALUE) onCopy(loaded);
                        return;
                      }
                      copyRequested.current = true;
                      setWanted(true);
                    }}
                  />
                  <ActionButton
                    label={visible ? "Hide value" : "Show value"}
                    name="eye"
                    onClick={() => setVisible(!visible)}
                  />
                </>
              )}
              {!managed && !version.redacted && !hidden && !current && (
                <ActionButton
                  label="Restore version"
                  icon={RotateCcwIcon}
                  disabledReason={editBlock}
                  onClick={() => {
                    restoreSubmitted.current = false;
                    setConfirm("restore");
                  }}
                />
              )}
              {!managed && !version.redacted && !current && (
                <ActionButton
                  label="Redact secret value"
                  name="trash"
                  disabledReason={editBlock}
                  onClick={() => setConfirm("redact")}
                />
              )}
            </span>
          )}
        </div>
        {version.redacted ? (
          <div className={styles.versionValue} data-redacted>
            <span aria-hidden>xxxxxxxxxxxxxxxxxxxx</span>
            <span className="sr-only">Redacted value</span>
          </div>
        ) : (
          <Tooltip content={canRead && !hiddenValue ? undefined : "Access denied"}>
            <div className={styles.versionValue}>
              {visible && !hiddenValue && (value || <span className={styles.muted}>EMPTY</span>)}
              {(!visible || hiddenValue) && mask}
            </div>
          </Tooltip>
        )}
        <span className={styles.versionActor}>
          <Icon
            name={version.actorType === "user" ? "user" : undefined}
            icon={actorIcons[version.actorType]}
            size={12}
          />
          {`${version.version === 1 ? "Created" : "Modified"} by ${actorName(version)}`}
        </span>
      </div>
      <AlertDialog
        open={confirm !== undefined}
        onOpenChange={(open) => {
          if (!open) setConfirm(undefined);
        }}
      >
        <AlertDialogContent
          tone={confirm === "redact" ? "danger" : undefined}
          icon={confirm === "redact" ? "trash" : "history"}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "redact" ? "Redact secret version" : "Restore secret version"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "redact"
                ? `Permanently removes the value of version ${version.version}.`
                : `Overwrites the current value with version ${version.version}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm === "restore" && valuePending && <Spinner label="Loading version value" />}
          {confirm === "restore" && Boolean(valueError) && (
            <Alert
              tone="bad"
              title="Could not load this version"
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  icon="sync"
                  disabled={retrying}
                  onClick={async () => {
                    setRetrying(true);
                    try {
                      await refetch();
                    } finally {
                      setRetrying(false);
                    }
                  }}
                >
                  Retry
                </Button>
              }
            />
          )}
          {confirm === "restore" && hiddenValue && (
            <Alert tone="bad" title="You don't have access to this version's value" />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === "redact" ? "destructive" : "default"}
              disabled={confirm === "restore" && !canRestore}
              onClick={(event) => {
                if (confirm === "redact") {
                  onRedact();
                  return;
                }
                if (
                  confirm !== "restore" ||
                  !canRestore ||
                  loaded === undefined ||
                  restoreSubmitted.current
                ) {
                  event.preventDefault();
                  return;
                }
                restoreSubmitted.current = true;
                onRestore(loaded);
              }}
            >
              {confirm === "redact" ? "Redact" : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

export function VersionHistorySheet({
  open,
  secret,
  environmentLabel,
  canRead,
  editBlock,
  onOpenChange,
  onCopy,
  onRestore,
  onRedact
}: {
  open: boolean;
  secret: Secret;
  environmentLabel: string;
  canRead: boolean;
  editBlock?: string;
  onOpenChange: (open: boolean) => void;
  onCopy: (value: string) => void;
  onRestore: (version: SecretVersion, value: string) => void;
  onRedact: (version: SecretVersion) => void;
}) {
  const { data, isPending } = useV4Adapter("secrets").useSecretVersions({
    secretId: open ? secret.id : "",
    limit: 50,
    offset: 0
  });
  const versions: SecretVersion[] = (data ?? []).map((entry) => {
    const actorType = entry.actor?.actorType;
    return {
      id: entry.id,
      version: entry.version,
      value: "",
      createdAt: entry.createdAt,
      actor: entry.actor?.name ?? "Unknown actor",
      actorType: actorType === "identity" || actorType === "platform" ? actorType : "user",
      redacted: entry.isRedacted,
      secretValueHidden: entry.secretValueHidden
    };
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={flowStyles.secretSheet}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle>Version history</SheetTitle>
        </SheetHeader>
        <SheetSubheader className={styles.subject}>
          <span className={styles.subjectName} data-mono>
            {secret.name}
          </span>
          <Badge tone="outline">{environmentLabel}</Badge>
        </SheetSubheader>
        <SheetBody>
          {open && isPending && (
            <Stack gap={24} role="status" aria-label="Loading versions">
              {[0, 1, 2].map((index) => (
                <Stack key={index} gap={8}>
                  <Skeleton width={160} height={16} />
                  <Skeleton height={36} />
                  <Skeleton width={120} />
                </Stack>
              ))}
            </Stack>
          )}
          <ol className={styles.timeline}>
            {versions.map((version, index) => (
              <VersionItem
                key={`${secret.id}:${version.id}:${version.version}`}
                secretId={secret.id}
                version={version}
                current={index === 0}
                last={index === versions.length - 1}
                canRead={canRead}
                editBlock={editBlock}
                managed={Boolean(secret.managedBy || secret.honeyToken)}
                onCopy={onCopy}
                onRestore={(value) => onRestore(version, value)}
                onRedact={() => onRedact(version)}
              />
            ))}
          </ol>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
