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
          {!isExpired && isOverride && (
            <AlertDialogDescription>
              The {actorKind} <span className="font-medium text-foreground">{actor?.name}</span>{" "}
              will fall back to their{" "}
              <span className="font-medium text-foreground">{roleNames}</span> project role in{" "}
              <span className="font-mono text-foreground">{folderPath}</span> on {environmentName}.
              {tierLabel ? ` This ${tierLabel} override` : " This override"} currently replaces that
              role here, so removing it can broaden or narrow their access.
            </AlertDialogDescription>
          )}
          {!isExpired && isRoleContextKnown && !isOverride && (
            <AlertDialogDescription>
              The {actorKind} <span className="font-medium text-foreground">{actor?.name}</span>{" "}
              will lose access to <span className="font-mono text-foreground">{folderPath}</span> on{" "}
              {environmentName}. No project role grants them access to this folder.
            </AlertDialogDescription>
          )}
          {!isExpired && !isRoleContextKnown && (
            <AlertDialogDescription>
              The {actorKind} <span className="font-medium text-foreground">{actor?.name}</span>{" "}
              will fall back to their project role permissions in{" "}
              <span className="font-mono text-foreground">{folderPath}</span> on {environmentName}.
              {tierLabel ? ` This ${tierLabel} grant` : " This grant"} currently replaces those
              permissions here, so removing it can change their access.
            </AlertDialogDescription>
          )}
          {isTemporary && expiry && (
            <AlertDialogDescription>
              It would otherwise expire in {expiry.value}, on {formatExpiryFull(expiry.expiresAt)}.
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>

        {/* <div className="overflow-hidden rounded-lg border border-danger/20 bg-danger/5">
          <div className="flex items-center gap-2 border-b border-danger/15 bg-danger/[0.07] px-3.5 py-2.5">
            <TriangleAlertIcon className="size-3.5 shrink-0 text-danger" />
            <span className="text-xs font-semibold text-foreground">
              Access affected after removal
            </span>
          </div>

          {isAuditUnavailable && (
            <Alert variant="warning" appearance="borderless" className="bg-transparent">
              <AlertDescription>
                Could not load {actor?.name}&apos;s project role permissions. Review their project
                roles before removing this access.
              </AlertDescription>
            </Alert>
          )}

          {!isAuditUnavailable && audit.isLoading && (
            <div className="space-y-2 p-3.5">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          )}

          {!isAuditUnavailable && audit.data && (
            <div className="max-h-72 thin-scrollbar overflow-y-auto [&_[data-slot=table-row]]:border-danger/10 [&_[data-slot=table-row]]:hover:bg-danger/5">
              {resources.map((resource) => {
                const visibleActions = resource.actions.filter(
                  (action) => action.state !== "forbid"
                );
                return (
                  <div key={resource.subject}>
                    <p className="px-3.5 pt-2.5 pb-1.5 text-[11px] font-medium tracking-wider text-muted uppercase">
                      {resource.label}
                    </p>
                    {visibleActions.length ? (
                      <Table containerClassName="rounded-none! border-0 bg-transparent!">
                        <TableBody>
                          {visibleActions.map((action) => (
                            <PermissionAuditRow key={action.action} audit={action} />
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="px-3.5 pb-2.5 text-xs text-muted">
                        No access from project roles.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div> */}

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
