import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v3";

import { FOLDER_ROLE_TIER_LABELS } from "./folder-access.const";
import {
  formatExpirationTime,
  formatExpiryFull,
  grantStateOf,
  TFolderAccessActor
} from "./folder-access.utils";

type Props = {
  actor: TFolderAccessActor | null;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: (actor: TFolderAccessActor) => void;
  isPending: boolean;
  folderPath: string;
  environmentName: string;
  // callers that do not load the member's project roles cannot tell an override from a plain grant
  isRoleContextKnown?: boolean;
};

export const RemoveFolderAccessDialog = ({
  actor,
  onOpenChange,
  onConfirm,
  isPending,
  folderPath,
  environmentName,
  isRoleContextKnown = true
}: Props) => {
  const isOpen = Boolean(actor);

  const tierLabel = actor?.access ? FOLDER_ROLE_TIER_LABELS[actor.access.permission] : null;
  // roles only lists the roles that grant access here, so a non-empty list means this grant overrides
  // access the member would keep without it
  const isOverride = Boolean(actor?.roles.length);
  const roleNames = actor?.roles.map((role) => role.name).join(", ");
  const actorKind = actor?.type === "identity" ? "identity" : "user";
  const grantState = grantStateOf(actor?.access ?? null);
  const endTime = actor?.access?.temporaryAccessEndTime;
  const expiry = endTime ? formatExpirationTime(endTime, Date.now()) : null;
  const isExpired = grantState === "expired";
  const isTemporary = grantState === "temporary";
  const isRecursive = Boolean(actor?.access?.isPermissionRecursive);
  const inheritedAccess = actor?.inheritedAccess ?? null;
  const inheritedTierLabel = inheritedAccess
    ? FOLDER_ROLE_TIER_LABELS[inheritedAccess.permission]
    : null;
  const noun = isOverride ? "Override" : "Access";

  const title = (() => {
    if (isExpired) return "Clear Expired Access";
    if (isTemporary) return `End Temporary ${noun}`;
    return isOverride ? "Remove Access Override" : "Remove Folder Access";
  })();
  const confirmLabel = (() => {
    if (isExpired) return "Clear Access";
    if (isTemporary) return `End ${noun}`;
    return isOverride ? "Remove Override" : "Remove Access";
  })();
  const confirmVariant = (() => {
    if (isExpired) return "outline" as const;
    return isOverride ? ("warning" as const) : ("danger" as const);
  })();

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {isExpired && expiry && (
            <AlertDialogDescription>
              This {tierLabel} grant for{" "}
              <span className="font-medium text-foreground">{actor?.name}</span> expired on{" "}
              {formatExpiryFull(expiry.expiresAt)} and no longer applies in{" "}
              <span className="font-mono text-foreground">{folderPath}</span>. Clearing it does not
              change their access.
            </AlertDialogDescription>
          )}
          {!isExpired && inheritedAccess && (
            <AlertDialogDescription>
              The {actorKind} <span className="font-medium text-foreground">{actor?.name}</span>{" "}
              will fall back to{" "}
              <span className="font-medium text-foreground">{inheritedTierLabel}</span>, inherited
              from <span className="font-mono text-foreground">{inheritedAccess.secretPath}</span>,
              in <span className="font-mono text-foreground">{folderPath}</span> on{" "}
              {environmentName}.{tierLabel ? ` This ${tierLabel} grant` : " This grant"} currently
              replaces it here, so removing it can broaden or narrow their access.
            </AlertDialogDescription>
          )}
          {!isExpired && !inheritedAccess && isOverride && (
            <AlertDialogDescription>
              The {actorKind} <span className="font-medium text-foreground">{actor?.name}</span>{" "}
              will fall back to their{" "}
              <span className="font-medium text-foreground">{roleNames}</span> project role in{" "}
              <span className="font-mono text-foreground">{folderPath}</span> on {environmentName}.
              {tierLabel ? ` This ${tierLabel} override` : " This override"} currently replaces that
              role here, so removing it can broaden or narrow their access.
            </AlertDialogDescription>
          )}
          {!isExpired && !inheritedAccess && isRoleContextKnown && !isOverride && (
            <AlertDialogDescription>
              The {actorKind} <span className="font-medium text-foreground">{actor?.name}</span>{" "}
              will lose access to <span className="font-mono text-foreground">{folderPath}</span> on{" "}
              {environmentName}. No project role grants them access to this folder.
            </AlertDialogDescription>
          )}
          {!isExpired && !inheritedAccess && !isRoleContextKnown && (
            <AlertDialogDescription>
              The {actorKind} <span className="font-medium text-foreground">{actor?.name}</span>{" "}
              will fall back to their project role permissions in{" "}
              <span className="font-mono text-foreground">{folderPath}</span> on {environmentName}.
              {tierLabel ? ` This ${tierLabel} grant` : " This grant"} currently replaces those
              permissions here, so removing it can change their access.
            </AlertDialogDescription>
          )}
          {!isExpired && isRecursive && (
            <AlertDialogDescription>
              This access also applies to the subfolders of{" "}
              <span className="font-mono text-foreground">{folderPath}</span>. Removing it returns
              them to their project roles in those subfolders too, except where they have a role set
              on the subfolder itself.
            </AlertDialogDescription>
          )}
          {isTemporary && expiry && (
            <AlertDialogDescription>
              It would otherwise expire in {expiry.value}, on {formatExpiryFull(expiry.expiresAt)}.
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={confirmVariant}
            isPending={isPending}
            onClick={(e) => {
              e.preventDefault();
              if (actor) onConfirm(actor);
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
