import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { format } from "date-fns";
import {
  DownloadIcon,
  EllipsisIcon,
  HistoryIcon,
  RotateCwIcon,
  TrashIcon,
  UploadIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  Button,
  DiscardChangesAlertDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Spinner
} from "@app/components/v3";
import {
  ProjectPermissionAgentVaultSkillActions,
  ProjectPermissionSub,
  useOrganization,
  useProjectPermission
} from "@app/context";
import {
  fromDraftFiles,
  getChangedSkillPaths,
  getSkillFileChanges,
  SKILL_ENTRY_FILE,
  toDraftFiles,
  TSkillDraftFile,
  TSkillFileChange
} from "@app/helpers/agentVaultSkills";
import { useDiscardChangesGuard } from "@app/hooks";
import {
  agentVaultKeys,
  SkillVersionConflictError,
  useGetAgentVaultSkill,
  useGetAgentVaultSkillVersion,
  useRestoreAgentVaultSkillVersion,
  useUpdateAgentVaultSkill
} from "@app/hooks/api/agentVault";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { useAgentVaultSheetState } from "@app/hooks/useAgentVaultSheetState";

import { DeleteSkillDialog } from "./DeleteSkillDialog";
import { downloadSkillVersion } from "./downloadSkillVersion";
import { RollBackSkillAlertDialog } from "./RollBackSkillAlertDialog";
import { SaveSkillVersionSheet } from "./SaveSkillVersionSheet";
import { handleSkillEditorEscape, SkillFilesEditor } from "./SkillFilesEditor";
import { SkillUploadDialog } from "./SkillUploadDialog";
import { SkillVersionHistoryDialog } from "./SkillVersionHistoryDialog";

type TEditState = {
  /** The version editing started from, kept even if a newer one is published meanwhile. */
  baseVersion: number;
  baseFiles: TSkillDraftFile[];
  draft: TSkillDraftFile[];
};

type TSkillDialog = "history" | "upload" | "delete" | "save";

type TSkillSheetBodyProps = {
  shownSkillId: string;
  closeSheet: () => Promise<void>;
  updateSkill: ReturnType<typeof useUpdateAgentVaultSkill>;
  registerRequestClose: (requestClose: () => void) => void;
};

const SkillSheetBody = ({
  shownSkillId,
  closeSheet,
  updateSkill,
  registerRequestClose
}: TSkillSheetBodyProps) => {
  const queryClient = useQueryClient();
  const { currentOrg } = useOrganization();
  const { hasProjectRole, permission } = useProjectPermission();
  const isAdmin = hasProjectRole(ProjectMembershipRole.Admin);
  const canEdit = permission.can(
    ProjectPermissionAgentVaultSkillActions.Edit,
    ProjectPermissionSub.AgentVaultSkills
  );
  const canDelete = permission.can(
    ProjectPermissionAgentVaultSkillActions.Delete,
    ProjectPermissionSub.AgentVaultSkills
  );

  const {
    data: skill,
    isPending: isSkillPending,
    error: skillError,
    isFetching: isSkillFetching,
    refetch: refetchSkill
  } = useGetAgentVaultSkill(shownSkillId);
  const [viewedVersion, setViewedVersion] = useState<number | null>(null);
  const [edit, setEdit] = useState<TEditState | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [dialog, setDialog] = useState<TSkillDialog | null>(null);
  const [discardCount, setDiscardCount] = useState(0);
  const [fileDiscardCounts, setFileDiscardCounts] = useState<Record<string, number>>({});
  const [rollBackVersion, setRollBackVersion] = useState<number | null>(null);
  // The latest version a refused save reported, shown before the refetched skill arrives.
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);

  // The skill carries the latest version's files, so only an older version is fetched on its own.
  const olderVersionNumber =
    viewedVersion !== null && viewedVersion !== skill?.latestVersion ? viewedVersion : undefined;
  const {
    data: olderVersionData,
    error: versionError,
    isFetching: isVersionFetching,
    refetch: refetchVersion
  } = useGetAgentVaultSkillVersion(shownSkillId, olderVersionNumber);
  const versionData = useMemo(() => {
    if (olderVersionNumber !== undefined) return olderVersionData;
    return skill && { version: skill.latestVersion, files: skill.files };
  }, [olderVersionNumber, olderVersionData, skill]);
  const restoreVersion = useRestoreAgentVaultSkillVersion();

  const original = useMemo(() => toDraftFiles(versionData?.files ?? []), [versionData]);
  // From the picked number, not the loaded data, so the latest draft isn't shown as editable while it loads or fails.
  const isViewingOlder = Boolean(
    skill && viewedVersion !== null && viewedVersion !== skill.latestVersion
  );
  // Admins edit the latest version in place; older versions and members are read-only.
  const isEditing = edit !== null && canEdit && !isViewingOlder;
  const files = isEditing && edit ? edit.draft : original;
  const { changedPaths, hasChanges } = useMemo(
    () =>
      edit
        ? getChangedSkillPaths(edit.baseFiles, edit.draft)
        : { changedPaths: new Set<string>(), hasChanges: false },
    [edit]
  );
  // A renamed or new file has no saved copy under its name, so only files edited in place can be discarded.
  const discardablePaths = useMemo(() => {
    const savedPaths = new Set(edit?.baseFiles.map((file) => file.path));
    return new Set([...changedPaths].filter((path) => savedPaths.has(path)));
  }, [edit, changedPaths]);

  // The line diff is only worked out for the save review, since it is too slow to run on every keystroke.
  const isSaveOpen = dialog === "save";
  const reviewChanges = useMemo(
    () => (isSaveOpen && edit ? getSkillFileChanges(edit.baseFiles, edit.draft) : null),
    [isSaveOpen, edit]
  );
  // Kept while the review animates closed, so its rows don't empty under it.
  const lastReviewChangesRef = useRef<TSkillFileChange[]>([]);
  if (reviewChanges) lastReviewChangesRef.current = reviewChanges;

  const latestKnownVersion = Math.max(skill?.latestVersion ?? 0, conflictVersion ?? 0);
  const newerVersion = edit && latestKnownVersion > edit.baseVersion ? latestKnownVersion : null;

  // The draft follows the latest version until the first change, then keeps the version it started from.
  useEffect(() => {
    if (!canEdit || !skill || !versionData || versionData.version !== skill.latestVersion) return;
    setEdit((prev) =>
      prev &&
      (prev.baseVersion === versionData.version ||
        getChangedSkillPaths(prev.baseFiles, prev.draft).hasChanges)
        ? prev
        : { baseVersion: versionData.version, baseFiles: original, draft: original }
    );
  }, [canEdit, skill, versionData, original]);

  const discardIntent = useRef<"stop" | "close">("stop");
  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({
      isDirty: hasChanges,
      onDiscard: () => {
        const isLatest = Boolean(
          skill && versionData && versionData.version === skill.latestVersion
        );
        setEdit((prev) => {
          if (!prev) return prev;
          return isLatest && versionData
            ? { baseVersion: versionData.version, baseFiles: original, draft: original }
            : { ...prev, draft: prev.baseFiles };
        });
        setDiscardCount((count) => count + 1);
        if (discardIntent.current === "close") closeSheet();
      }
    });

  const requestStopEditing = () => {
    discardIntent.current = "stop";
    requestDiscard();
  };

  const requestClose = () => {
    discardIntent.current = "close";
    requestDiscard();
  };
  registerRequestClose(requestClose);

  // Once the newer version has been shown, saving goes ahead without the version check.
  const handleSave = async () => {
    if (!skill || !edit) return;
    try {
      const {
        skill: saved,
        version: published,
        unchanged
      } = await updateSkill.mutateAsync({
        skillId: skill.id,
        files: fromDraftFiles(edit.draft),
        ...(newerVersion === null && { baseVersion: edit.baseVersion })
      });
      createNotification({
        text: unchanged
          ? `No changes. Version ${published.version} of "${saved.name}" already has these files.`
          : `Saved version ${published.version} of "${saved.name}"`,
        type: unchanged ? "info" : "success"
      });
      setDialog(null);
      setEdit((prev) => prev && { ...prev, baseVersion: published.version, baseFiles: prev.draft });
      setViewedVersion(null);
    } catch (error) {
      if (error instanceof SkillVersionConflictError) setConflictVersion(error.latestVersion);
      // Any other failure is shown by the global mutation handler.
    }
  };

  const handleRollBack = async (target: number) => {
    if (!skill) return;
    try {
      const { version: restored, unchanged } = await restoreVersion.mutateAsync({
        skillId: skill.id,
        version: target
      });
      createNotification(
        unchanged
          ? { text: "This version already matches the latest.", type: "info" }
          : {
              text: `Rolled "${skill.name}" back to version ${target} as version ${restored.version}`,
              type: "success"
            }
      );
      setViewedVersion(null);
    } catch {
      // The global mutation handler shows the server's message.
    }
  };

  const handleDiscardFile = (path: string) => {
    setEdit((prev) => {
      if (!prev) return prev;
      const saved = prev.baseFiles.find((file) => file.path === path);
      if (!saved) return prev;
      return { ...prev, draft: prev.draft.map((file) => (file.path === path ? saved : file)) };
    });
    setFileDiscardCounts((counts) => ({ ...counts, [path]: (counts[path] ?? 0) + 1 }));
  };

  const renderFiles = () => {
    if (versionData || isEditing) {
      return (
        <SkillFilesEditor
          files={files}
          selectedPath={selectedPath}
          onSelect={setSelectedPath}
          isEditing={isEditing}
          onChange={
            isEditing ? (draft) => setEdit((prev) => prev && { ...prev, draft }) : undefined
          }
          changedPaths={changedPaths}
          discardablePaths={discardablePaths}
          requiredPaths={[SKILL_ENTRY_FILE]}
          historyKey={`${discardCount}:${edit?.baseVersion}`}
          fileHistoryKeys={fileDiscardCounts}
          onDiscardFile={isEditing ? handleDiscardFile : undefined}
          className="min-h-96 flex-1"
        />
      );
    }
    if (versionError) {
      return (
        <Empty className="min-h-96 flex-1 border">
          <EmptyHeader>
            <EmptyTitle>Couldn&apos;t load this version</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              size="xs"
              isPending={isVersionFetching}
              onClick={() => refetchVersion()}
            >
              <RotateCwIcon />
              Try Again
            </Button>
          </EmptyContent>
        </Empty>
      );
    }
    return <Skeleton className="min-h-96 w-full flex-1" />;
  };

  const renderBody = () => {
    if (!skill && isSkillPending) {
      return (
        <Empty className="m-4 border">
          <EmptyHeader>
            <Spinner size="sm" />
          </EmptyHeader>
        </Empty>
      );
    }
    const isSkillMissing = axios.isAxiosError(skillError) && skillError.response?.status === 404;
    if (!skill && skillError && !isSkillMissing) {
      return (
        <Empty className="m-4 border">
          <EmptyHeader>
            <EmptyTitle>Couldn&apos;t load this skill</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button
              variant="outline"
              size="xs"
              isPending={isSkillFetching}
              onClick={() => refetchSkill()}
            >
              <RotateCwIcon />
              Try Again
            </Button>
          </EmptyContent>
        </Empty>
      );
    }
    if (!skill) {
      return (
        <Empty className="m-4 border">
          <EmptyHeader>
            <EmptyTitle>Skill not found</EmptyTitle>
            <EmptyDescription>
              This skill was deleted, or you don&apos;t have access to it.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    return (
      <>
        <SheetHeader className="pr-12">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <SheetTitle className="flex items-center gap-2">
                <span className="truncate">{skill.name}</span>
              </SheetTitle>
              <SheetDescription className="line-clamp-2" title={skill.description}>
                {skill.description}
              </SheetDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild disabled={hasChanges}>
                  <Button variant="outline">
                    Options
                    <EllipsisIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {isAdmin && (
                    <DropdownMenuItem onClick={() => setDialog("history")}>
                      <HistoryIcon />
                      Version History
                    </DropdownMenuItem>
                  )}
                  {canEdit && (
                    <DropdownMenuItem
                      onClick={() => {
                        setDialog("upload");
                        refetchSkill();
                      }}
                    >
                      <UploadIcon />
                      Upload New Version
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    isDisabled={!versionData}
                    onClick={() => versionData && downloadSkillVersion(skill.name, versionData)}
                  >
                    <DownloadIcon />
                    Download
                  </DropdownMenuItem>
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="danger" onClick={() => setDialog("delete")}>
                        <TrashIcon />
                        Delete Skill
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </SheetHeader>

        <div className="flex min-h-0 thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto p-4">
          {isViewingOlder && viewedVersion !== null && (
            <Alert variant="info">
              <AlertDescription className="flex flex-wrap items-center gap-2">
                <span className="flex-1">
                  You are viewing v{viewedVersion}
                  {olderVersionData &&
                    `, published ${format(new Date(olderVersionData.createdAt), "MMM d, yyyy h:mm a")}`}
                  . Agents get v{skill.latestVersion}.
                </span>
                <Button variant="outline" size="xs" onClick={() => setViewedVersion(null)}>
                  View Latest
                </Button>
                {canEdit && (
                  <Button
                    variant="av"
                    size="xs"
                    isPending={restoreVersion.isPending}
                    isDisabled={!versionData}
                    onClick={() => setRollBackVersion(viewedVersion)}
                  >
                    <HistoryIcon />
                    Roll Back
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}

          {renderFiles()}
        </div>

        {canEdit && !isViewingOlder && (
          <SheetFooter className="items-center justify-end border-t">
            {hasChanges && <span className="mr-auto text-sm text-accent">Unsaved changes</span>}
            <Button
              variant="ghost"
              onClick={requestStopEditing}
              isDisabled={!hasChanges || updateSkill.isPending}
            >
              Discard
            </Button>
            <Button
              variant="av"
              isDisabled={!hasChanges}
              onClick={() => {
                setDialog("save");
                refetchSkill();
              }}
            >
              Save Version
            </Button>
          </SheetFooter>
        )}
      </>
    );
  };

  return (
    <>
      {renderBody()}

      {skill && (
        <>
          {isAdmin && (
            <SkillVersionHistoryDialog
              isOpen={dialog === "history"}
              onOpenChange={(open) => setDialog(open ? "history" : null)}
              skill={skill}
              viewedVersion={viewedVersion ?? skill.latestVersion}
              canRollBack={canEdit}
              onView={(next) => setViewedVersion(next === skill.latestVersion ? null : next)}
              onRolledBack={() => setViewedVersion(null)}
            />
          )}

          {canEdit && (
            <SkillUploadDialog
              isOpen={dialog === "upload"}
              onOpenChange={(open) => setDialog(open ? "upload" : null)}
              skill={skill}
              onSaved={() => setViewedVersion(null)}
            />
          )}

          <SaveSkillVersionSheet
            isOpen={dialog === "save"}
            onOpenChange={(open) => setDialog(open ? "save" : null)}
            skillName={skill.name}
            nextVersion={skill.latestVersion + 1}
            newerVersion={newerVersion}
            changes={lastReviewChangesRef.current}
            isPending={updateSkill.isPending}
            onSave={handleSave}
          />
        </>
      )}

      <RollBackSkillAlertDialog
        version={rollBackVersion}
        onOpenChange={(open) => !open && setRollBackVersion(null)}
        onConfirm={(target) => {
          setRollBackVersion(null);
          handleRollBack(target);
        }}
      />

      <DeleteSkillDialog
        skill={dialog === "delete" && skill ? skill : null}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
        onDeleted={async () => {
          if (!skill) return;
          await closeSheet();
          queryClient.removeQueries({ queryKey: agentVaultKeys.skill(currentOrg.id, skill.id) });
        }}
      />

      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Changes?"
        description="Your edits to this skill will be lost."
      />
    </>
  );
};

/** A skill's files, opened from the `skillId` search param of the page it is on. */
export const SkillSheet = () => {
  const { id: skillId, closeSheet } = useAgentVaultSheetState("skillId");

  // Kept while the sheet animates closed, so its contents don't change under it.
  const lastSkillIdRef = useRef(skillId);
  if (skillId) lastSkillIdRef.current = skillId;
  const shownSkillId = skillId ?? lastSkillIdRef.current ?? "";

  const updateSkill = useUpdateAgentVaultSkill();
  const requestCloseRef = useRef<() => void>(closeSheet);

  return (
    <Sheet open={Boolean(skillId)} onOpenChange={(open) => !open && requestCloseRef.current()}>
      <SheetContent
        size="wide"
        className="flex h-full max-h-full w-full flex-col gap-y-0"
        isPending={updateSkill.isPending}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={handleSkillEditorEscape}
      >
        <SkillSheetBody
          key={shownSkillId}
          shownSkillId={shownSkillId}
          closeSheet={closeSheet}
          updateSkill={updateSkill}
          registerRequestClose={(requestClose) => {
            requestCloseRef.current = requestClose;
          }}
        />
      </SheetContent>
    </Sheet>
  );
};
