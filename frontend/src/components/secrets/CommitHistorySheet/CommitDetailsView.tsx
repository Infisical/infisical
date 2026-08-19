import { useEffect, useState } from "react";
import axios from "axios";
import { format } from "date-fns";
import {
  ChevronDownIcon,
  GitCommitHorizontalIcon,
  InfoIcon,
  MaximizeIcon,
  MinimizeIcon,
  TriangleAlertIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  CopyButton,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Field,
  FieldLabel,
  Input,
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
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { useCommitRevert, useGetCommitDetails } from "@app/hooks/api/folderCommits/queries";
import { CommitType } from "@app/hooks/api/types";

import { buildResourceChange } from "./buildResourceChange";
import { CommitChangeSummaryText } from "./CommitChangeSummary";
import { CommitSheetBackLink } from "./CommitSheetBackLink";
import { CommitCardsSkeleton, CommitDetailsHeaderSkeleton } from "./CommitSkeletons";
import { ResourceChange, ResourceChangeCard } from "./ResourceChangeCard";

const REVERT_CONFIRM_KEY = "revert";

type Props = {
  projectId: string;
  environment: string;
  environmentName: string;
  secretPath: string;
  commitId: string;
  onBack: () => void;
  onCommitReverted: () => void;
  onGoToRestore: () => void;
};

export const CommitDetailsView = ({
  projectId,
  environment,
  environmentName,
  secretPath,
  commitId,
  onBack,
  onCommitReverted,
  onGoToRestore
}: Props) => {
  const [collapsedIds, setCollapsedIds] = useState<Record<string, boolean>>({});
  const [fullStateIds, setFullStateIds] = useState<Record<string, boolean>>({});
  const [isRevertOpen, setIsRevertOpen] = useState(false);
  const [revertConfirmation, setRevertConfirmation] = useState("");

  const {
    data: commitDetails,
    isPending,
    error,
    refetch
  } = useGetCommitDetails(projectId, commitId);
  const { mutateAsync: revert, isPending: isReverting } = useCommitRevert({
    commitId,
    projectId,
    environment,
    directory: secretPath
  });

  const commit = commitDetails?.changes;

  useEffect(() => {
    setCollapsedIds({});
    setFullStateIds({});
  }, [commitId]);

  const handleRevert = async () => {
    const response = await revert();
    if (!response.success) {
      createNotification({ type: "error", text: response.message });
      return;
    }

    createNotification({ type: "success", text: response.message });
    setIsRevertOpen(false);
    onCommitReverted();
  };

  if (isPending) {
    return (
      <>
        <SheetHeader className="gap-3">
          <CommitSheetBackLink label="Commit History" onClick={onBack} />
          <SheetTitle className="sr-only">Commit Details</SheetTitle>
          <CommitDetailsHeaderSkeleton />
        </SheetHeader>
        <CommitCardsSkeleton />
      </>
    );
  }

  if (!commit) {
    // A commit reachable from the history list only 404s if it was pruned since the list
    // loaded, so anything else is an operational failure the user can retry out of
    const isMissing = axios.isAxiosError(error) && error.response?.status === 404;

    return (
      <>
        <SheetHeader>
          <CommitSheetBackLink label="Commit History" onClick={onBack} />
          <SheetTitle className="sr-only">Commit Details</SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 p-4">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {isMissing ? <GitCommitHorizontalIcon /> : <TriangleAlertIcon />}
              </EmptyMedia>
              <EmptyTitle>{isMissing ? "Commit Not Found" : "Unable To Load Commit"}</EmptyTitle>
              <EmptyDescription>
                {isMissing
                  ? "This commit is no longer part of this folder's history."
                  : "Something went wrong loading the changes in this commit."}
              </EmptyDescription>
            </EmptyHeader>
            {!isMissing && (
              <EmptyContent>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  Try Again
                </Button>
              </EmptyContent>
            )}
          </Empty>
        </div>
      </>
    );
  }

  const changes: ResourceChange[] = (commit.changes ?? [])
    .map((change) => {
      const isSecret = Boolean(change.secretVersionId || change.secretKey);

      let operationType: "create" | "update" | "delete" = "create";
      if (change.changeType === CommitType.DELETE) operationType = "delete";
      else if (change.isUpdate) operationType = "update";

      return buildResourceChange({
        id: change.id,
        type: isSecret ? "secret" : "folder",
        operationType,
        name: (isSecret ? change.secretKey : change.folderName) || "Unnamed",
        versions: change.versions
      });
    })
    .filter((change): change is ResourceChange => change !== null)
    .sort((a, b) => {
      if (a.operationType !== b.operationType) {
        const order = { delete: 0, update: 1, create: 2 };
        return order[a.operationType] - order[b.operationType];
      }
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const summary = changes.reduce(
    (acc, change) => {
      if (change.type === "secret") acc.secretCount += 1;
      else acc.folderCount += 1;

      if (change.operationType === "create") acc.addedCount += 1;
      else if (change.operationType === "update") acc.updatedCount += 1;
      else acc.deletedCount += 1;

      return acc;
    },
    { secretCount: 0, folderCount: 0, addedCount: 0, updatedCount: 0, deletedCount: 0 }
  );

  const isEveryFullState = changes.length > 0 && changes.every((change) => fullStateIds[change.id]);

  const authorName =
    commit.actorMetadata?.name ||
    (commit.actorType === ActorType.PLATFORM ? "Platform" : commit.actorType);

  return (
    <>
      <SheetHeader className="gap-3">
        <CommitSheetBackLink label="Commit History" onClick={onBack} />
        <SheetTitle className="sr-only">Commit Details</SheetTitle>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-foreground">
                {commit.message || <span className="text-muted italic">No message</span>}
              </h2>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-accent">
              <span className="truncate">{authorName}</span>
              {commit.actorType === ActorType.PLATFORM && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="-ml-1 flex items-center">
                      <InfoIcon className="size-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Generated automatically by the platform as part of an automated event.
                  </TooltipContent>
                </Tooltip>
              )}
              <span aria-hidden className="text-muted">
                &middot;
              </span>
              <time dateTime={String(commit.createdAt)}>
                {format(new Date(commit.createdAt), "MMM d, yyyy, h:mm a")}
              </time>
              <span className="flex items-center gap-1">
                <code className="font-mono">{commit.id.substring(0, 8)}</code>
                <CopyButton value={commit.id} ariaLabel="Copy commit ID" size="2xs" />
              </span>
              <span aria-hidden className="text-muted">
                &middot;
              </span>
              <Badge variant="neutral">{environmentName}</Badge>
              <code className="font-mono">{secretPath}</code>
            </div>
          </div>
          <ProjectPermissionCan
            I={ProjectPermissionCommitsActions.PerformRollback}
            a={ProjectPermissionSub.Commits}
          >
            {(isAllowed) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" isDisabled={!isAllowed}>
                    Restore Options
                    <ChevronDownIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-w-sm">
                  {!commit.isLatest && (
                    <DropdownMenuItem onClick={onGoToRestore} className="flex-col items-start">
                      <span className="text-sm font-medium text-foreground">
                        Roll Back to This Commit
                      </span>
                      <span className="text-xs leading-snug whitespace-normal text-accent">
                        Return this folder to its exact state at this commit, discarding every
                        change made after it.
                      </span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    onClick={() => setIsRevertOpen(true)}
                    className="flex-col items-start"
                  >
                    <span className="text-sm font-medium text-foreground">Revert Changes</span>
                    <span className="text-xs leading-snug whitespace-normal text-accent">
                      Restore the previous version of the resources this commit touched.
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </ProjectPermissionCan>
        </div>

        {changes.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-foreground">
                {changes.length} {changes.length === 1 ? "resource" : "resources"} changed
              </span>
              <CommitChangeSummaryText summary={summary} showLabels />
            </div>
            <Button
              variant="ghost"
              size="xs"
              className="-mr-2"
              onClick={() =>
                setFullStateIds(
                  isEveryFullState
                    ? {}
                    : Object.fromEntries(changes.map((change) => [change.id, true]))
                )
              }
            >
              {isEveryFullState ? <MinimizeIcon /> : <MaximizeIcon />}
              {isEveryFullState ? "Collapse all to summary" : "Expand all to full state"}
            </Button>
          </div>
        )}
      </SheetHeader>

      <div className="flex min-h-0 thin-scrollbar flex-1 flex-col gap-3 overflow-y-auto p-4">
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
                <GitCommitHorizontalIcon />
              </EmptyMedia>
              <EmptyTitle>No Changes Found</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </div>

      <AlertDialog
        open={isRevertOpen}
        onOpenChange={(open) => {
          setIsRevertOpen(open);
          if (!open) setRevertConfirmation("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert Changes</AlertDialogTitle>
            <AlertDialogDescription>
              This undoes every change made in this commit by restoring the previous version of the
              resources it touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogConfirmationField>
            <Field>
              <FieldLabel htmlFor="revert-commit-confirmation" size="sm">
                <span>
                  Type &quot;<span className="text-foreground">{REVERT_CONFIRM_KEY}</span>&quot; to
                  confirm.
                </span>
              </FieldLabel>
              <Input
                id="revert-commit-confirmation"
                value={revertConfirmation}
                onChange={(event) => setRevertConfirmation(event.target.value)}
                placeholder={REVERT_CONFIRM_KEY}
                autoComplete="off"
                autoFocus
              />
            </Field>
          </AlertDialogConfirmationField>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {/* Plain Button, not AlertDialogAction, so the dialog stays open while the
                revert runs and on failure */}
            <Button
              variant="danger"
              size="sm"
              isDisabled={revertConfirmation !== REVERT_CONFIRM_KEY || isReverting}
              isPending={isReverting}
              onClick={handleRevert}
            >
              Revert Changes
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
