import { useEffect, useState } from "react";
import { FolderIcon, GitCommitHorizontalIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Checkbox,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldLabel,
  Input,
  Label,
  SheetHeader,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  ProjectPermissionCommitsActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useCommitRollback, useGetRollbackPreview } from "@app/hooks/api/folderCommits/queries";

import { buildResourceChange } from "./buildResourceChange";
import { CommitSheetBackLink } from "./CommitSheetBackLink";
import {
  CommitCardsSkeleton,
  CommitRestoreFooterSkeleton,
  CommitRestoreHeaderSkeleton
} from "./CommitSkeletons";
import { ResourceChange, ResourceChangeCard } from "./ResourceChangeCard";

const MAX_RESTORE_MESSAGE_LENGTH = 256;

type Props = {
  projectId: string;
  environment: string;
  secretPath: string;
  folderId: string;
  commitId: string;
  onBack: () => void;
  onRestored: () => void;
};

export const CommitRestoreView = ({
  projectId,
  environment,
  secretPath,
  folderId,
  commitId,
  onBack,
  onRestored
}: Props) => {
  const [isDeepRollback, setIsDeepRollback] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState(folderId);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [collapsedIds, setCollapsedIds] = useState<Record<string, boolean>>({});
  const [fullStateIds, setFullStateIds] = useState<Record<string, boolean>>({});

  const {
    data: folderChanges,
    isPending,
    isPlaceholderData,
    isError,
    refetch
  } = useGetRollbackPreview(folderId, commitId, environment, projectId, isDeepRollback, secretPath);

  const { mutateAsync: rollback, isPending: isRollingBack } = useCommitRollback({
    projectId,
    commitId,
    folderId,
    deepRollback: isDeepRollback,
    environment,
    directory: secretPath,
    envSlug: environment
  });

  useEffect(() => {
    if (!isDeepRollback) setSelectedFolderId(folderId);
  }, [isDeepRollback, folderId]);

  const folders = folderChanges ?? [];
  const currentFolder = folders.find((folder) => folder.folderId === folderId);
  const nestedFolders = folders.filter((folder) => folder.folderId !== folderId);
  const selectedFolder = folders.find((folder) => folder.folderId === selectedFolderId);

  const hasAnyChanges = folders.some((folder) => folder.changes.length > 0);

  const changes: ResourceChange[] = (selectedFolder?.changes ?? [])
    .map((change) =>
      buildResourceChange({
        id: change.id,
        type: change.type,
        operationType: change.changeType === "add" ? "create" : change.changeType,
        name:
          (change.type === "secret"
            ? (change as { secretKey?: string }).secretKey
            : (change as { folderName?: string }).folderName) || "Unnamed",
        versions: (change as { versions?: { version: number }[] }).versions,
        isRollback: true
      })
    )
    .filter((change): change is ResourceChange => change !== null);

  const handleRollback = async () => {
    await rollback(message);
    createNotification({ type: "success", text: "Restore completed successfully" });
    setIsConfirmOpen(false);
    onRestored();
  };

  if (isPending) {
    return (
      <>
        <SheetHeader className="gap-3">
          <CommitSheetBackLink label="Commit Details" onClick={onBack} />
          <SheetTitle className="sr-only">Restore Commit</SheetTitle>
          <CommitRestoreHeaderSkeleton />
        </SheetHeader>
        <CommitCardsSkeleton />
        <CommitRestoreFooterSkeleton />
      </>
    );
  }

  return (
    <ProjectPermissionCan
      renderGuardBanner
      I={ProjectPermissionCommitsActions.PerformRollback}
      a={ProjectPermissionSub.Commits}
    >
      <SheetHeader className="gap-3">
        <CommitSheetBackLink label="Commit Details" onClick={onBack} />
        <SheetTitle className="sr-only">Restore Commit</SheetTitle>
        <p className="text-sm text-accent">
          Restoring returns <code className="font-mono text-foreground">{secretPath}</code> to how
          it looked at commit{" "}
          <code className="font-mono text-foreground">{commitId.substring(0, 8)}</code>. Every
          change made after this commit is undone.
        </p>
        <div className="flex items-center gap-2">
          <Checkbox
            id="deep-rollback"
            variant="project"
            isChecked={isDeepRollback}
            onCheckedChange={(checked) => setIsDeepRollback(checked === true)}
          />
          <Label htmlFor="deep-rollback">Restore all child folders</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex items-center text-muted">
                <InfoIcon className="size-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent>
              Also returns every nested folder to its state at this commit.
            </TooltipContent>
          </Tooltip>
        </div>
      </SheetHeader>

      <div className="flex min-h-0 flex-1">
        {isDeepRollback && nestedFolders.length > 0 && (
          <div className="thin-scrollbar w-64 shrink-0 overflow-y-auto border-r border-border">
            <button
              type="button"
              onClick={() => setSelectedFolderId(folderId)}
              className={twMerge(
                "flex w-full items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-left transition-colors duration-200 hover:bg-container-hover",
                selectedFolderId === folderId && "bg-container"
              )}
            >
              <span className="flex min-w-0 items-center gap-2">
                <FolderIcon className="size-4 shrink-0 text-folder" />
                <span className="truncate font-mono text-sm">
                  {currentFolder?.folderPath || secretPath}
                </span>
              </span>
              {Boolean(currentFolder?.changes.length) && (
                <Badge variant="neutral">{currentFolder?.changes.length}</Badge>
              )}
            </button>
            <div className="border-b border-border px-4 py-2 text-xs text-label">
              Child folders to restore
            </div>
            {nestedFolders.map((folder) => (
              <button
                key={folder.folderId}
                type="button"
                onClick={() => setSelectedFolderId(folder.folderId)}
                className={twMerge(
                  "flex w-full items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-left transition-colors duration-200 hover:bg-container-hover",
                  selectedFolderId === folder.folderId && "bg-container"
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <FolderIcon className="size-4 shrink-0 text-folder" />
                  <span className="truncate font-mono text-sm">
                    {folder.folderPath || folder.folderName}
                  </span>
                </span>
                {folder.changes.length > 0 && (
                  <Badge variant="neutral">{folder.changes.length}</Badge>
                )}
              </button>
            ))}
          </div>
        )}

        <div
          className={twMerge(
            "flex min-h-0 thin-scrollbar min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4",
            isPlaceholderData && "pointer-events-none animate-pulse opacity-60"
          )}
        >
          {changes.length ? (
            changes.map((change) => (
              <ResourceChangeCard
                key={change.id}
                change={change}
                isCollapsed={Boolean(collapsedIds[change.id])}
                onToggleCollapse={() =>
                  setCollapsedIds((prev) => ({ ...prev, [change.id]: !prev[change.id] }))
                }
                isFullState={Boolean(fullStateIds[change.id])}
                onToggleFullState={() =>
                  setFullStateIds((prev) => ({ ...prev, [change.id]: !prev[change.id] }))
                }
              />
            ))
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {isError ? <TriangleAlertIcon /> : <GitCommitHorizontalIcon />}
                </EmptyMedia>
                <EmptyTitle>{isError ? "Preview Unavailable" : "Nothing To Restore"}</EmptyTitle>
                <EmptyDescription>
                  {isError
                    ? "We could not work out what restoring this commit would change, so restoring is blocked."
                    : "This folder already matches its state at this commit."}
                </EmptyDescription>
              </EmptyHeader>
              {isError && (
                <EmptyContent>
                  <Button variant="outline" size="sm" onClick={() => refetch()}>
                    Try Again
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          )}
        </div>
      </div>

      <div className="flex items-end gap-2 border-t border-border p-4">
        <Field className="flex-1">
          <FieldLabel htmlFor="restore-message" size="sm">
            Restore message
          </FieldLabel>
          <Input
            id="restore-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Why are you restoring this commit?"
            maxLength={MAX_RESTORE_MESSAGE_LENGTH}
          />
        </Field>
        <Button
          variant="project"
          onClick={() => setIsConfirmOpen(true)}
          isDisabled={!message.length || !hasAnyChanges || isPlaceholderData}
        >
          Restore
        </Button>
      </div>

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Commit {commitId.substring(0, 8)}?</AlertDialogTitle>
            <AlertDialogDescription>
              {isDeepRollback
                ? "This returns this folder and every child folder to its state at this commit."
                : "This returns this folder to its state at this commit."}{" "}
              Changes made after this commit are permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {/* Plain Button, not AlertDialogAction, so the dialog stays open while the
                restore runs and on failure */}
            <Button
              variant="danger"
              size="sm"
              isDisabled={isRollingBack}
              isPending={isRollingBack}
              onClick={handleRollback}
            >
              Restore
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ProjectPermissionCan>
  );
};
