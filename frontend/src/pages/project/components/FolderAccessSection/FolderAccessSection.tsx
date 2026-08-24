import { useState } from "react";
import { subject } from "@casl/ability";
import { format, formatDistance } from "date-fns";
import {
  CircleAlertIcon,
  ClockAlertIcon,
  ClockIcon,
  FolderIcon,
  RefreshCwIcon,
  Trash2Icon,
  UsersIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  PageLoader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  ProjectPermissionSecretFolderActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import {
  TFolderAccess,
  useDeleteIdentityFolderAccess,
  useDeleteUserFolderAccess,
  useListIdentityFolderAccess,
  useListUserFolderAccess
} from "@app/hooks/api/folderAccess";
import { FOLDER_ROLE_TIER_LABELS } from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/folder-access.const";
import {
  toIdentityActor,
  toUserActor
} from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/folder-access.utils";
import { RemoveFolderAccessDialog } from "@app/pages/secret-manager/OverviewPage/components/FolderAccessSheet/RemoveFolderAccessDialog";

import { EditFolderAccessSheet } from "./EditFolderAccessSheet";
import { TFolderAccessSectionActor } from "./types";

type Props = {
  actor: TFolderAccessSectionActor;
  hideActions?: boolean;
};

export const FolderAccessSection = ({ actor, hideActions = false }: Props) => {
  const { projectId, currentProject } = useProject();
  const { permission } = useProjectPermission();

  const [editTarget, setEditTarget] = useState<TFolderAccess | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TFolderAccess | null>(null);

  const userAccess = useListUserFolderAccess({
    projectId,
    userId: actor.type === "user" ? actor.id : ""
  });
  const identityAccess = useListIdentityFolderAccess({
    projectId,
    identityId: actor.type === "identity" ? actor.id : ""
  });
  const {
    data: folderAccess,
    isPending,
    isError,
    refetch
  } = actor.type === "user" ? userAccess : identityAccess;

  const deleteUserAccess = useDeleteUserFolderAccess();
  const deleteIdentityAccess = useDeleteIdentityFolderAccess();

  const environmentNameOf = (slug: string) =>
    currentProject?.environments.find((env) => env.slug === slug)?.name ?? slug;

  const canManageAccessOn = (row: TFolderAccess) =>
    permission.can(
      ProjectPermissionSecretFolderActions.ManageAccess,
      subject(ProjectPermissionSub.SecretFolders, {
        environment: row.environment,
        secretPath: row.secretPath
      })
    );

  const actorNoun = actor.type === "user" ? "user" : "machine identity";

  const dialogActor = (() => {
    if (!deleteTarget) return null;
    if (actor.type === "user") {
      return toUserActor({
        userId: actor.id,
        membershipId: actor.membershipId,
        username: actor.username,
        email: actor.email,
        firstName: actor.firstName,
        lastName: actor.lastName,
        folderRBACAccess: deleteTarget
      });
    }
    return toIdentityActor({
      identityId: actor.id,
      name: actor.name,
      folderRBACAccess: deleteTarget
    });
  })();

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = {
      projectId,
      environmentSlug: deleteTarget.environment,
      secretPath: deleteTarget.secretPath
    };
    if (actor.type === "user") {
      await deleteUserAccess.mutateAsync({ ...target, userId: actor.id });
    } else {
      await deleteIdentityAccess.mutateAsync({ ...target, identityId: actor.id });
    }
    createNotification({ type: "success", text: "Folder access removed" });
    setDeleteTarget(null);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Folder Access</CardTitle>
          <CardDescription>
            Folder-level access for this {actorNoun}. Overrides{" "}
            {actor.type === "user" ? "their" : "its"} project roles within each folder.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isError && (
            <Alert variant="danger">
              <CircleAlertIcon />
              <AlertTitle>Could not load folder access</AlertTitle>
              <AlertDescription>
                <span>Retry to load this {actorNoun}&apos;s folder access.</span>
                <Button size="xs" variant="danger" onClick={() => refetch().catch(() => undefined)}>
                  <RefreshCwIcon />
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {!isError && isPending && (
            <div className="h-40 w-full">
              <PageLoader lottieClassName="w-16" />
            </div>
          )}
          {!isError &&
            !isPending &&
            (folderAccess?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-2/5">Folder</TableHead>
                    <TableHead>Environment</TableHead>
                    <TableHead>Access</TableHead>
                    <TableHead>Duration</TableHead>
                    {!hideActions && <TableHead variant="action" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {folderAccess.map((row) => {
                    const isExpired =
                      row.isTemporary && new Date() > new Date(row.temporaryAccessEndTime || "");

                    let text = "Permanent";
                    let toolTipText = "Non-Expiring Access";
                    if (row.isTemporary) {
                      if (isExpired) {
                        text = "Access Expired";
                        toolTipText = "Timed Access Expired";
                      } else {
                        text = formatDistance(
                          new Date(row.temporaryAccessEndTime || ""),
                          new Date()
                        );
                        toolTipText = `Until ${format(
                          new Date(row.temporaryAccessEndTime || ""),
                          "yyyy-MM-dd hh:mm:ss aaa"
                        )}`;
                      }
                    }

                    const canManage = canManageAccessOn(row);

                    return (
                      <TableRow key={`folder-access-${row.id}`}>
                        <TableCell>
                          <div className="flex min-w-0 items-center gap-2">
                            <FolderIcon className="size-3.5 shrink-0 text-folder" />
                            <span className="truncate font-mono">{row.secretPath}</span>
                          </div>
                        </TableCell>
                        <TableCell>{environmentNameOf(row.environment)}</TableCell>
                        <TableCell>{FOLDER_ROLE_TIER_LABELS[row.permission]}</TableCell>
                        <TableCell>
                          {row.isTemporary ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  className="capitalize"
                                  variant={isExpired ? "danger" : "warning"}
                                >
                                  {isExpired ? <ClockAlertIcon /> : <ClockIcon />}
                                  {text}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>{toolTipText}</TooltipContent>
                            </Tooltip>
                          ) : (
                            text
                          )}
                        </TableCell>
                        {!hideActions && (
                          <TableCell variant="action">
                            <div className="flex items-center justify-end">
                              <Tooltip disableHoverableContent>
                                <TooltipTrigger>
                                  <IconButton
                                    variant="ghost"
                                    size="xs"
                                    aria-label="Manage folder access"
                                    isDisabled={!canManage}
                                    onClick={(e) => {
                                      setEditTarget(row);
                                      e.stopPropagation();
                                    }}
                                  >
                                    <UsersIcon />
                                  </IconButton>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {canManage ? "Manage Access" : "Access Restricted"}
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip disableHoverableContent>
                                <TooltipTrigger>
                                  <IconButton
                                    variant="ghost"
                                    size="xs"
                                    aria-label="Remove folder access"
                                    className="hover:text-danger"
                                    isDisabled={!canManage}
                                    onClick={(e) => {
                                      setDeleteTarget(row);
                                      e.stopPropagation();
                                    }}
                                  >
                                    <Trash2Icon />
                                  </IconButton>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {canManage ? "Remove Folder Access" : "Access Restricted"}
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>This {actorNoun} has no folder access</EmptyTitle>
                  <EmptyDescription>
                    Grant folder-level access from the Secrets overview using a folder&apos;s Manage
                    Access action
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ))}
        </CardContent>
      </Card>
      <EditFolderAccessSheet
        access={editTarget}
        actor={actor}
        environmentName={editTarget ? environmentNameOf(editTarget.environment) : ""}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditTarget(null);
        }}
      />
      <RemoveFolderAccessDialog
        actor={dialogActor}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDeleteTarget(null);
        }}
        onConfirm={() => handleDelete()}
        isPending={deleteUserAccess.isPending || deleteIdentityAccess.isPending}
        folderPath={deleteTarget?.secretPath ?? ""}
        environmentName={deleteTarget ? environmentNameOf(deleteTarget.environment) : ""}
      />
    </>
  );
};
