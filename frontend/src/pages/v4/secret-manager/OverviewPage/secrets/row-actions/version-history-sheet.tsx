import { useState } from "react";
import { format } from "date-fns";
import { EyeOffIcon, HardDriveIcon, RotateCcwIcon, ServerCogIcon } from "lucide-react";

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
import { Icon } from "@app/components/v4/ui/icon";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetSubheader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { type Secret, type SecretVersion, versionsOf } from "../../secrets-model";
import { ActionButton } from "../overview-cells";

import flowStyles from "../flows/flows.module.css";
import styles from "./row-actions.module.css";

const mask = "••••••••••••••••••••";
const actorIcons = { user: undefined, identity: HardDriveIcon, platform: ServerCogIcon };
const actorName = (version: SecretVersion) =>
  version.actorType === "platform" ? "System" : version.actor;

function VersionItem({
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
  version: SecretVersion;
  current: boolean;
  last: boolean;
  canRead: boolean;
  editBlock?: string;
  managed: boolean;
  onCopy: (value: string) => void;
  onRestore: () => void;
  onRedact: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const [confirm, setConfirm] = useState<"restore" | "redact">();
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
              {!version.redacted && (
                <>
                  <ActionButton
                    label="Copy value"
                    name="copy"
                    onClick={() => onCopy(version.value)}
                  />
                  <ActionButton
                    label={visible ? "Hide value" : "Show value"}
                    name="eye"
                    onClick={() => setVisible(!visible)}
                  />
                </>
              )}
              {!managed && !current && (
                <ActionButton
                  label="Restore version"
                  icon={RotateCcwIcon}
                  disabledReason={editBlock}
                  onClick={() => setConfirm("restore")}
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
          <Tooltip content={canRead ? undefined : "Access denied"}>
            <div className={styles.versionValue}>
              {visible && (version.value || <span className={styles.muted}>EMPTY</span>)}
              {!visible && mask}
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
                ? `Are you sure you want to redact the secret value on version ${version.version}? This action is irreversible.`
                : `Are you sure you want to restore this secret to version ${version.version}? This will overwrite the current value.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={confirm === "redact" ? "destructive" : "default"}
              onClick={confirm === "redact" ? onRedact : onRestore}
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
  onRestore: (version: SecretVersion) => void;
  onRedact: (version: SecretVersion) => void;
}) {
  const versions = versionsOf(secret);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={flowStyles.secretSheet}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle>Version history</SheetTitle>
          <SheetDescription>Audit secret history and rollback changes</SheetDescription>
        </SheetHeader>
        <SheetSubheader className={styles.subject}>
          <span className={styles.subjectName}>{secret.name}</span>
          <Badge tone="outline">{environmentLabel}</Badge>
        </SheetSubheader>
        <SheetBody>
          <ol className={styles.timeline}>
            {versions.map((version, index) => (
              <VersionItem
                key={version.version}
                version={version}
                current={index === 0}
                last={index === versions.length - 1}
                canRead={canRead}
                editBlock={editBlock}
                managed={Boolean(secret.managedBy || secret.honeyToken)}
                onCopy={onCopy}
                onRestore={() => onRestore(version)}
                onRedact={() => onRedact(version)}
              />
            ))}
          </ol>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
