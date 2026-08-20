import { useMemo } from "react";
import { TriangleAlertIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Skeleton,
  Table,
  TableBody
} from "@app/components/v3";
import { ProjectPermissionSub, useProject } from "@app/context";
import {
  useGetIdentityPermissionAudit,
  useGetMembershipPermissionAudit
} from "@app/hooks/api/projects/queries";
import { ProjectType } from "@app/hooks/api/projects/types";
import {
  evaluateAllResources,
  getAuditSubjects,
  PermissionAuditRow,
  resolveSources
} from "@app/views/PermissionAuditSheet";

import { FOLDER_ROLE_TIER_LABELS } from "./folder-access.const";
import { TFolderAccessActor } from "./folder-access.utils";

const FOLDER_SCOPE_SUBJECTS: ProjectPermissionSub[] = [
  ProjectPermissionSub.Secrets,
  ProjectPermissionSub.SecretFolders,
  ProjectPermissionSub.SecretImports,
  ProjectPermissionSub.DynamicSecrets
];

type Props = {
  actor: TFolderAccessActor | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
  projectId: string;
  folderPath: string;
  environmentName: string;
};

export const RemoveFolderAccessDialog = ({
  actor,
  isOpen,
  onOpenChange,
  onConfirm,
  isPending,
  projectId,
  folderPath,
  environmentName
}: Props) => {
  const { currentProject } = useProject();
  const projectType = currentProject?.type ?? ProjectType.SecretManager;

  const membershipId = actor?.type === "user" ? actor.membershipId : null;
  const membershipAudit = useGetMembershipPermissionAudit(projectId, membershipId ?? "", {
    enabled: isOpen,
    retry: false
  });
  const identityAudit = useGetIdentityPermissionAudit(
    projectId,
    actor?.type === "identity" ? actor.id : "",
    { enabled: isOpen, retry: false }
  );

  const audit = actor?.type === "identity" ? identityAudit : membershipAudit;
  const isAuditUnavailable = (actor?.type === "user" && !actor.membershipId) || audit.isError;

  const resources = useMemo(() => {
    if (!audit.data) return [];
    const descriptors = getAuditSubjects(projectType).filter((descriptor) =>
      FOLDER_SCOPE_SUBJECTS.includes(descriptor.subject)
    );
    return evaluateAllResources(descriptors, resolveSources(audit.data.sources));
  }, [audit.data, projectType]);

  const tierLabel = actor?.access ? FOLDER_ROLE_TIER_LABELS[actor.access.permission] : null;

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-xl">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <TriangleAlertIcon className="text-warning" />
          </AlertDialogMedia>
          <AlertDialogTitle>Remove Folder Access</AlertDialogTitle>
          <AlertDialogDescription>
            {actor?.name} will fall back to their project role permissions in{" "}
            <span className="font-mono text-foreground">{folderPath}</span> on {environmentName}.
            {tierLabel ? ` This ${tierLabel} grant currently replaces` : " This grant replaces"}{" "}
            those permissions on this folder, so removing it can broaden their access.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isAuditUnavailable && (
          <Alert variant="warning">
            <AlertDescription>
              Could not load {actor?.name}&apos;s project role permissions. Review their project
              roles before removing this access.
            </AlertDescription>
          </Alert>
        )}

        {!isAuditUnavailable && audit.isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}

        {!isAuditUnavailable && audit.data && (
          <div className="max-h-72 thin-scrollbar space-y-4 overflow-y-auto">
            <p className="text-xs font-medium text-muted">Access affected after removal</p>
            {resources.map((resource) => {
              const visibleActions = resource.actions.filter((action) => action.state !== "forbid");
              return (
                <div key={resource.subject} className="space-y-1">
                  <p className="text-xs font-medium text-foreground">{resource.label}</p>
                  {visibleActions.length ? (
                    <Table>
                      <TableBody>
                        {visibleActions.map((action) => (
                          <PermissionAuditRow key={action.action} audit={action} />
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-xs text-muted">No access from project roles.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            isPending={isPending}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            Remove Access
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
