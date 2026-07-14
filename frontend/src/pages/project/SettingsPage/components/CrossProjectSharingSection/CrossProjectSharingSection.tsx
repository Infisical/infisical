import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { format } from "date-fns";
import { Box, Check, FolderIcon, Minus, Pencil, Plus, Trash2 } from "lucide-react";

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
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
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
  folders: string[];
  grantMatrix: Map<string, TProjectFolderGrant>;
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
    const folderSet = new Set<string>();
    const grantMatrix = new Map<string, TProjectFolderGrant>();
    let oldestDate = projectGrants[0].createdAt;

    projectGrants.forEach((g) => {
      const folder = g.secretPath;
      folderSet.add(folder);
      grantMatrix.set(`${folder}:${g.environmentSlug}`, g);
      if (g.createdAt < oldestDate) oldestDate = g.createdAt;
    });

    return {
      targetProjectId,
      targetProjectName: projectGrants[0].targetProjectName,
      totalSecrets: projectGrants.reduce((sum, g) => sum + g.secretCount, 0),
      folders: Array.from(folderSet).sort(),
      grantMatrix,
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
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Folder</TableHead>
                        {currentProject.environments.map((env) => (
                          <TableHead key={env.slug} className="text-center">
                            {env.name}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {projectGroup.folders.map((folder) => (
                        <TableRow key={folder}>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <FolderIcon className="size-3.5 text-muted" />
                              <span className="text-sm">{folder}</span>
                            </div>
                          </TableCell>
                          {currentProject.environments.map((env) => {
                            const grant = projectGroup.grantMatrix.get(`${folder}:${env.slug}`);
                            return (
                              <TableCell key={env.slug} className="text-center">
                                {grant ? (
                                  <Check className="mx-auto size-4 text-success" />
                                ) : (
                                  <Minus className="mx-auto size-4 text-muted" />
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
