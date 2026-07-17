import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { format } from "date-fns";
import { Box, ChevronRight, FolderIcon, Layers, Pencil, Plus, Trash2 } from "lucide-react";

import { createNotification } from "@app/components/notifications";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Input
} from "@app/components/v3";
import { apiRequest } from "@app/config/request";
import { useProject } from "@app/context";
import {
  TProjectFolderGrant,
  useListProjectFolderGrants
} from "@app/hooks/api/projectFolderGrants";
import { projectFolderGrantKeys } from "@app/hooks/api/projectFolderGrants/queries";

import { ShareSecretsEditData, ShareSecretsSheet } from "./ShareSecretsSheet";

type ProjectGroup = {
  targetProjectId: string;
  targetProjectName: string;
  totalSecrets: number;
  oldestGrantDate: string;
  grants: TProjectFolderGrant[];
};

const groupGrantsByProject = (grants: TProjectFolderGrant[]): ProjectGroup[] => {
  const byProject = grants.reduce((map, grant) => {
    const existing = map.get(grant.targetProjectId) ?? [];
    existing.push(grant);
    map.set(grant.targetProjectId, existing);
    return map;
  }, new Map<string, TProjectFolderGrant[]>());

  return Array.from(byProject.entries()).map(([targetProjectId, projectGrants]) => {
    let oldestDate = projectGrants[0].createdAt;
    projectGrants.forEach((g) => {
      if (g.createdAt < oldestDate) oldestDate = g.createdAt;
    });

    return {
      targetProjectId,
      targetProjectName: projectGrants[0].targetProjectName,
      totalSecrets: projectGrants.reduce((sum, g) => sum + g.secretCount, 0),
      oldestGrantDate: oldestDate,
      grants: projectGrants
    };
  });
};

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

  const { data: grants = [] } = useListProjectFolderGrants(currentProject.id);

  const projectGroups = useMemo(() => groupGrantsByProject(grants), [grants]);

  const handleEdit = (group: ProjectGroup) => {
    setEditData({
      targetProjectId: group.targetProjectId,
      targetProjectName: group.targetProjectName,
      grants: group.grants
    });
    setIsShareSheetOpen(true);
  };

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
          <Button
            variant="project"
            size="sm"
            onClick={() => {
              setEditData(null);
              setIsShareSheetOpen(true);
            }}
          >
            <Plus className="size-3.5" />
            Share Secrets
          </Button>
          <ShareSecretsSheet
            isOpen={isShareSheetOpen}
            onOpenChange={handleSheetOpenChange}
            editData={editData}
            existingGrants={grants}
          />
        </div>
        <p className="max-w-2xl text-sm text-accent">
          Grant another project read access to a slice of this project&apos;s secrets. The target
          project can then import them, or reference them inline with{" "}
          <code className="rounded bg-mineshaft-700 px-1 py-0.5 font-mono text-xs text-yellow-200">
            ${"{@project-a.SECRET}"}
          </code>
          .
        </p>
      </CardHeader>
      <CardContent>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm text-mineshaft-400">Linked Projects</span>
          <Badge variant="neutral">{projectGroups.length}</Badge>
        </div>
        {grants.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No projects have access yet</EmptyTitle>
              <EmptyDescription>
                Share secrets to grant another project read access.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Accordion type="multiple" defaultValue={projectGroups.map((g) => g.targetProjectId)}>
            {projectGroups.map((projectGroup) => (
              <AccordionItem
                key={projectGroup.targetProjectId}
                value={projectGroup.targetProjectId}
              >
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
                  <div className="flex items-center gap-2 pr-2">
                    <span className="text-xs text-muted">
                      {format(new Date(projectGroup.oldestGrantDate), "MMM d, yyyy")}
                    </span>
                    <IconButton
                      variant="ghost-muted"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(projectGroup);
                      }}
                    >
                      <Pencil />
                    </IconButton>
                    <IconButton
                      variant="ghost-muted"
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(projectGroup);
                      }}
                    >
                      <Trash2 />
                    </IconButton>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="rounded-md border border-mineshaft-600">
                    <div className="flex items-center justify-between border-b border-mineshaft-600 px-4 py-2 text-xs text-muted">
                      <span>Shared location in this project</span>
                      <span>Secrets shared</span>
                    </div>
                    {projectGroup.grants
                      .sort((a, b) => {
                        const envOrder =
                          a.environmentName.localeCompare(b.environmentName);
                        if (envOrder !== 0) return envOrder;
                        return a.secretPath.localeCompare(b.secretPath);
                      })
                      .map((grant) => (
                        <div
                          key={grant.id}
                          className="flex items-center justify-between border-b border-mineshaft-600 px-4 py-2.5 last:border-b-0"
                        >
                          <div className="flex items-center gap-2 text-sm">
                            <Badge variant="neutral" className="gap-1.5">
                              <Layers className="size-3" />
                              {grant.environmentName}
                            </Badge>
                            <ChevronRight className="size-3.5 text-muted" />
                            <FolderIcon className="size-3.5 text-muted" />
                            <span>{grant.secretPath}</span>
                          </div>
                          <span className="text-sm tabular-nums">
                            {grant.secretCount}
                          </span>
                        </div>
                      ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
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
    </Card>
  );
};
