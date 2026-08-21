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
import { TFolderAccessActor } from "./folder-access.utils";

type Props = {
  actor: TFolderAccessActor | null;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: (actor: TFolderAccessActor) => void;
  isPending: boolean;
  folderPath: string;
  environmentName: string;
};

export const RemoveFolderAccessDialog = ({
  actor,
  onOpenChange,
  onConfirm,
  isPending,
  folderPath,
  environmentName
}: Props) => {
  // const { currentProject, projectId } = useProject();
  const isOpen = Boolean(actor);

  // const membershipId = actor?.type === "user" ? actor.membershipId : null;
  // const membershipAudit = useGetMembershipPermissionAudit(projectId, membershipId ?? "", {
  //   enabled: isOpen,
  //   retry: false,
  //   includeFolderPermissions: false
  // });
  // const identityAudit = useGetIdentityPermissionAudit(
  //   projectId,
  //   actor?.type === "identity" ? actor.id : "",
  //   { enabled: isOpen, retry: false, includeFolderPermissions: false }
  // );

  // const audit = actor?.type === "identity" ? identityAudit : membershipAudit;
  // const isAuditUnavailable = (actor?.type === "user" && !actor.membershipId) || audit.isError;

  // const resources = useMemo(() => {
  //   if (!audit.data) return [];
  //   const descriptors = getAuditSubjects(currentProject.type).filter((descriptor) =>
  //     FOLDER_SCOPE_SUBJECTS.includes(descriptor.subject)
  //   );
  //   return evaluateAllResources(descriptors, resolveSources(audit.data.sources));
  // }, [audit.data, currentProject.type]);

  const tierLabel = actor?.access ? FOLDER_ROLE_TIER_LABELS[actor.access.permission] : null;

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Folder Access</AlertDialogTitle>
          <AlertDialogDescription>
            The {actor?.type === "identity" ? "identity" : "user"}{" "}
            <span className="font-medium text-foreground">{actor?.name}</span> will fall back to
            their project role permissions in{" "}
            <span className="font-mono text-foreground">{folderPath}</span> on {environmentName}.
            {tierLabel ? ` This ${tierLabel} grant currently replaces` : " This grant replaces"}{" "}
            those permissions on this folder, so removing it can broaden their access.
          </AlertDialogDescription>
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
            variant="danger"
            isPending={isPending}
            onClick={(e) => {
              e.preventDefault();
              if (actor) onConfirm(actor);
            }}
          >
            Remove Access
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
