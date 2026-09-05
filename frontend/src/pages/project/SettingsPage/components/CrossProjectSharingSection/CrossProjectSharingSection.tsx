import { useMemo, useState } from "react";
import { subject } from "@casl/ability";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { format, formatDistanceToNowStrict } from "date-fns";
import {
  Box,
  ChevronRight,
  EllipsisVerticalIcon,
  FolderIcon,
  Layers,
  PencilIcon,
  Plus,
  TrashIcon
} from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { PermissionDeniedBanner } from "@app/components/permissions";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DocumentationLinkBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Input,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { apiRequest } from "@app/config/request";
import {
  ProjectPermissionProjectFolderGrantActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import {
  TProjectFolderGrant,
  useListProjectFolderGrants
} from "@app/hooks/api/projectFolderGrants";
import { projectFolderGrantKeys } from "@app/hooks/api/projectFolderGrants/queries";
import { usePopUp } from "@app/hooks/usePopUp";

import { ShareSecretsEditData, ShareSecretsSheet } from "./ShareSecretsSheet";

type ProjectGroup = {
  targetProjectId: string;
  targetProjectName: string;
  totalSecrets: number;
  grants: TProjectFolderGrant[];
};

const groupGrantsByProject = (grants: TProjectFolderGrant[]): ProjectGroup[] => {
  const byProject = grants.reduce((map, grant) => {
    const existing = map.get(grant.targetProjectId) ?? [];
    existing.push(grant);
    map.set(grant.targetProjectId, existing);
    return map;
  }, new Map<string, TProjectFolderGrant[]>());

  return Array.from(byProject.entries()).map(([targetProjectId, projectGrants]) => ({
    targetProjectId,
    targetProjectName: projectGrants[0].targetProjectName,
    totalSecrets: projectGrants.reduce((sum, g) => sum + g.secretCount, 0),
    grants: projectGrants
  }));
};

const projectFolderGrantSubject = (environment: string, secretPath: string) =>
  subject(ProjectPermissionSub.ProjectFolderGrant, { environment, secretPath });

type DeleteProjectGrantsDialogProps = {
  grants: TProjectFolderGrant[];
  projectName: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  sourceProjectId: string;
};

const CONFIRMATION_KEYWORD = "confirm";

const DeleteProjectGrantsDialog = ({
  grants,
  projectName,
  isOpen,
  onOpenChange,
  sourceProjectId
}: DeleteProjectGrantsDialogProps) => {
  const [confirmation, setConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const queryClient = useQueryClient();

  const isConfirmed = confirmation === CONFIRMATION_KEYWORD;

  const handleConfirmDelete = async () => {
    if (!isConfirmed || grants.length === 0) return;

    setIsDeleting(true);
    try {
      await Promise.all(
        grants.map((g) =>
          apiRequest
            .delete(`/api/v1/project-folder-grants/${g.id}`, {
              params: { sourceProjectId }
            })
            .catch((err) => {
              if (axios.isAxiosError(err) && err.response?.status === 404) return;
              throw err;
            })
        )
      );

      await queryClient.invalidateQueries({
        queryKey: projectFolderGrantKeys.listByProject(sourceProjectId)
      });
      await queryClient.invalidateQueries({
        queryKey: projectFolderGrantKeys.listReceived(grants[0].targetProjectId)
      });

      createNotification({ text: "All grants removed", type: "success" });
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      createNotification({ text: "Failed to remove grants", type: "error" });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) setConfirmation("");
        onOpenChange(open);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove All Grants</AlertDialogTitle>
          <AlertDialogDescription>
            This will revoke <strong>{projectName}</strong>&apos;s access to all {grants.length}{" "}
            shared {grants.length === 1 ? "grant" : "grants"}. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="w-full pb-4">
          <p className="mb-2 text-sm text-muted">
            Type <span className="font-medium text-foreground">{CONFIRMATION_KEYWORD}</span> to
            proceed
          </p>
          <Input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={CONFIRMATION_KEYWORD}
            autoComplete="off"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            onClick={handleConfirmDelete}
            isPending={isDeleting}
            disabled={!isConfirmed}
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export const CrossProjectSharingSection = () => {
  const [isShareSheetOpen, setIsShareSheetOpen] = useState(false);
  const [editData, setEditData] = useState<ShareSecretsEditData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectGroup | null>(null);
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);
  const canEditGrants =
    permission.can(
      ProjectPermissionProjectFolderGrantActions.CreateGrant,
      ProjectPermissionSub.ProjectFolderGrant
    ) &&
    permission.can(
      ProjectPermissionProjectFolderGrantActions.RevokeGrant,
      ProjectPermissionSub.ProjectFolderGrant
    );
  const canRevokeGrants = permission.can(
    ProjectPermissionProjectFolderGrantActions.RevokeGrant,
    ProjectPermissionSub.ProjectFolderGrant
  );

  const canCreateGrant = (environment: string, secretPath: string) =>
    permission.can(
      ProjectPermissionProjectFolderGrantActions.CreateGrant,
      projectFolderGrantSubject(environment, secretPath)
    );

  const canRevokeGrant = (environment: string, secretPath: string) =>
    permission.can(
      ProjectPermissionProjectFolderGrantActions.RevokeGrant,
      projectFolderGrantSubject(environment, secretPath)
    );

  const canCreateAnyGrant = permission
    .rulesFor(
      ProjectPermissionProjectFolderGrantActions.CreateGrant,
      ProjectPermissionSub.ProjectFolderGrant
    )
    .some((rule) => !rule.inverted);

  const canReadGrants = permission.can(
    ProjectPermissionProjectFolderGrantActions.ReadGrant,
    ProjectPermissionSub.ProjectFolderGrant
  );
  const { data: grants, isPending: isGrantsLoading } = useListProjectFolderGrants(
    currentProject.id,
    canReadGrants
  );

  const handleEdit = (group: ProjectGroup) => {
    setEditData({
      targetProjectId: group.targetProjectId,
      targetProjectName: group.targetProjectName,
      grants: group.grants
    });
    setIsShareSheetOpen(true);
  };

  const projectGroups = useMemo(() => groupGrantsByProject(grants ?? []), [grants]);

  let grantsContent: JSX.Element;
  if (!canReadGrants) {
    grantsContent = <PermissionDeniedBanner />;
  } else if (isGrantsLoading) {
    grantsContent = (
      <div className="space-y-3" aria-label="Loading shared projects">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  } else if (grants?.length === 0) {
    grantsContent = (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>No projects have access yet</EmptyTitle>
          <EmptyDescription>Share secrets to grant another project read access.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    grantsContent = (
      <Accordion type="multiple" defaultValue={projectGroups.map((g) => g.targetProjectId)}>
        {projectGroups.map((projectGroup) => (
          <AccordionItem key={projectGroup.targetProjectId} value={projectGroup.targetProjectId}>
            <AccordionTrigger>
              <div className="flex flex-1 items-center gap-3">
                <Badge variant="project" className="gap-1.5">
                  <Box className="size-3" />
                  {projectGroup.targetProjectName}
                </Badge>
                <span className="text-xs text-muted">
                  {projectGroup.totalSecrets}{" "}
                  {projectGroup.totalSecrets === 1 ? "secret" : "secrets"} shared
                </span>
              </div>
              {(canEditGrants || canRevokeGrants || canCreateAnyGrant) && (
                <div
                  className="pr-2"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  role="presentation"
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton aria-label="Actions" variant="ghost-muted" size="xs">
                        <EllipsisVerticalIcon className="size-4" />
                      </IconButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {subscription?.crossProjectSecretSharing &&
                        (canEditGrants ||
                          projectGroup.grants.some((grant) =>
                            canRevokeGrant(grant.environmentSlug, grant.secretPath)
                          )) && (
                          <DropdownMenuItem onClick={() => handleEdit(projectGroup)}>
                            <PencilIcon className="mr-2 size-4" />
                            Edit
                          </DropdownMenuItem>
                        )}
                      {projectGroup.grants.every((grant) =>
                        canRevokeGrant(grant.environmentSlug, grant.secretPath)
                      ) && (
                        <DropdownMenuItem
                          variant="danger"
                          onClick={() => setDeleteTarget(projectGroup)}
                        >
                          <TrashIcon className="mr-2 size-4" />
                          Delete
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </AccordionTrigger>
            <AccordionContent className="p-6">
              <div className="rounded-md border border-border">
                <div className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border px-4 py-2 text-xs text-muted">
                  <span>Shared location in this project</span>
                  <span className="w-24 text-right">Secrets shared</span>
                </div>
                {projectGroup.grants
                  .sort((a, b) => {
                    const envOrder = a.environmentName.localeCompare(b.environmentName);
                    if (envOrder !== 0) return envOrder;
                    return a.secretPath.localeCompare(b.secretPath);
                  })
                  .map((grant) => (
                    <div
                      key={grant.id}
                      className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border px-4 py-2.5 last:border-b-0"
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex w-fit items-center gap-2 text-sm">
                            <Badge variant="neutral" className="gap-1.5">
                              <Layers className="size-3" />
                              {grant.environmentName}
                            </Badge>
                            <ChevronRight className="size-3.5 text-muted" />
                            <FolderIcon className="size-3.5 text-muted" />
                            <span>{grant.secretPath}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          Shared{" "}
                          {formatDistanceToNowStrict(new Date(grant.createdAt), {
                            addSuffix: true
                          })}{" "}
                          ({format(new Date(grant.createdAt), "MMM d, yyyy 'at' h:mm a")})
                        </TooltipContent>
                      </Tooltip>
                      <span className="w-24 text-right text-sm tabular-nums">
                        {grant.secretCount}
                      </span>
                    </div>
                  ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    );
  }

  const handleSheetOpenChange = (open: boolean) => {
    setIsShareSheetOpen(open);
    if (!open) setEditData(null);
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex w-full items-center justify-between">
          <CardTitle>
            Cross-Project Secret Sharing
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/secret-reference#cross-project-secret-sharing" />
          </CardTitle>
          {canCreateAnyGrant && (
            <Button
              variant="project"
              size="sm"
              onClick={() => {
                if (!subscription?.crossProjectSecretSharing) {
                  handlePopUpOpen("upgradePlan");
                  return;
                }
                setEditData(null);
                setIsShareSheetOpen(true);
              }}
            >
              <Plus className="size-3.5" />
              Share Secrets
            </Button>
          )}
          <ShareSecretsSheet
            isOpen={isShareSheetOpen}
            onOpenChange={handleSheetOpenChange}
            editData={editData}
            existingGrants={grants ?? []}
            canCreateGrant={canCreateGrant}
            canRevokeGrant={canRevokeGrant}
          />
        </div>
        <p className="max-w-2xl text-sm text-accent">
          Grant another project read access to a slice of this project&apos;s secrets. The target
          project can then import them, or reference them inline with{" "}
          <code className="rounded bg-container px-1 py-0.5 font-mono text-xs text-foreground">
            ${"{@project-a.SECRET}"}
          </code>
          .
        </p>
      </CardHeader>
      <CardContent>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm text-muted">Linked Projects</span>
          <Badge variant="neutral">{projectGroups.length}</Badge>
        </div>
        {grantsContent}
      </CardContent>
      <DeleteProjectGrantsDialog
        grants={deleteTarget?.grants ?? []}
        projectName={deleteTarget?.targetProjectName ?? ""}
        isOpen={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        sourceProjectId={currentProject.id}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Your current plan does not allow sharing secrets across projects. To unlock this feature, please upgrade to Infisical Pro plan."
      />
    </Card>
  );
};
