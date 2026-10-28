import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { format } from "date-fns";
import FileSaver from "file-saver";
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
  buildSkillZip,
  decodeSkillFile,
  fromDraftFiles,
  getSkillEntryName,
  getSkillFileChanges,
  SKILL_ENTRY_FILE,
  SKILL_NAME_RE,
  toDraftFiles,
  TSkillDraftFile
} from "@app/helpers/agentVaultSkills";
import { useDiscardChangesGuard } from "@app/hooks";
import {
  agentVaultKeys,
  useGetAgentVaultSkill,
  useGetAgentVaultSkillVersion,
  usePublishAgentVaultSkillVersion,
  useRestoreAgentVaultSkillVersion
} from "@app/hooks/api/agentVault";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { useAgentVaultSheetState } from "@app/hooks/useAgentVaultSheetState";

import { DeleteSkillDialog } from "./DeleteSkillDialog";
import { SaveSkillVersionSheet } from "./SaveSkillVersionSheet";
import { keepOpenOnNameInputEscape, SkillFilesEditor } from "./SkillFilesEditor";
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
  publishVersion: ReturnType<typeof usePublishAgentVaultSkillVersion>;
  registerRequestClose: (requestClose: () => void) => void;
};

const SkillSheetBody = ({
  shownSkillId,
  closeSheet,
  publishVersion,
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

  const version = viewedVersion ?? skill?.latestVersion;
  const {
    data: versionData,
    error: versionError,
    isFetching: isVersionFetching,
    refetch: refetchVersion
  } = useGetAgentVaultSkillVersion(shownSkillId, version);
  const restoreVersion = useRestoreAgentVaultSkillVersion();

  const original = useMemo(() => toDraftFiles(versionData?.files ?? []), [versionData]);
  const isViewingOlder = Boolean(
    skill && versionData && versionData.version !== skill.latestVersion
  );
  // Admins edit the latest version in place; older versions and members are read-only.
  const isEditing = edit !== null && canEdit && !isViewingOlder;
  const files = isEditing && edit ? edit.draft : original;
  const changes = useMemo(
    () => (edit ? getSkillFileChanges(edit.baseFiles, edit.draft) : []),
    [edit]
  );
  const changedPaths = useMemo(
    () => new Set(changes.filter((change) => change.status !== "deleted").map((c) => c.path)),
    [changes]
  );
  const hasChanges = changes.length > 0;

  // The draft follows the latest version until the first change, then keeps the version it started from.
  useEffect(() => {
    if (!canEdit || !skill || !versionData || versionData.version !== skill.latestVersion) return;
    setEdit((prev) =>
      prev &&
      (prev.baseVersion === versionData.version ||
        getSkillFileChanges(prev.baseFiles, prev.draft).length > 0)
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

  const handleSave = async () => {
    if (!skill || !edit) return;
    try {
      const {
        skill: saved,
        version: published,
        unchanged
      } = await publishVersion.mutateAsync({
        skillId: skill.id,
        files: fromDraftFiles(edit.draft)
      });
      createNotification({
        text: unchanged
          ? `No changes. Version ${published.version} of "${saved.name}" already has these files.`
          : `Saved version ${published.version} of "${saved.name}"`,
        type: unchanged ? "info" : "success"
      });
      setDialog(null);
      setEdit((prev) => prev && { ...prev, baseFiles: prev.draft });
      setViewedVersion(null);
    } catch {
      // The global mutation handler shows the server's message.
    }
  };

  const handleRollBack = async () => {
    if (!skill || !versionData) return;
    try {
      const { version: restored, unchanged } = await restoreVersion.mutateAsync({
        skillId: skill.id,
        version: versionData.version
      });
      createNotification(
        unchanged
          ? { text: "This version already matches the latest.", type: "info" }
          : {
              text: `Rolled "${skill.name}" back to version ${versionData.version} as version ${restored.version}`,
              type: "success"
            }
      );
      setViewedVersion(null);
    } catch {
      // The global mutation handler shows the server's message.
    }
  };

  const handleDownload = () => {
    if (!skill || !versionData) return;
    const entry = versionData.files.find((file) => file.path === SKILL_ENTRY_FILE);
    const entryName = getSkillEntryName(entry && decodeSkillFile(entry));
    const folder = entryName && SKILL_NAME_RE.test(entryName) ? entryName : skill.name;
    FileSaver.saveAs(
      new Blob([buildSkillZip(folder, versionData.files)], { type: "application/zip" }),
      `${skill.name}-v${versionData.version}.zip`
    );
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
          requiredPaths={[SKILL_ENTRY_FILE]}
          historyKey={discardCount}
          className="h-[calc(100dvh-14rem)] min-h-96 shrink-0"
        />
      );
    }
    if (versionError) {
      return (
        <Empty className="h-[calc(100dvh-14rem)] min-h-96 shrink-0 border">
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
    return <Skeleton className="h-[calc(100dvh-14rem)] min-h-96 w-full shrink-0" />;
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
            {!hasChanges && (
              <div className="flex shrink-0 items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
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
                      <DropdownMenuItem onClick={() => setDialog("upload")}>
                        <UploadIcon />
                        Upload New Version
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem isDisabled={!versionData} onClick={handleDownload}>
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
            )}
          </div>
        </SheetHeader>

        <div className="flex min-h-0 thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto p-4">
          {isViewingOlder && versionData && (
            <Alert variant="info">
              <AlertDescription className="flex flex-wrap items-center gap-2">
                <span className="flex-1">
                  You are viewing v{versionData.version}, published{" "}
                  {format(new Date(versionData.createdAt), "MMM d, yyyy h:mm a")}. Agents get v
                  {skill.latestVersion}.
                </span>
                <Button variant="outline" size="xs" onClick={() => setViewedVersion(null)}>
                  View Latest
                </Button>
                {canEdit && (
                  <Button
                    variant="av"
                    size="xs"
                    isPending={restoreVersion.isPending}
                    onClick={handleRollBack}
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

        {isEditing && hasChanges && (
          <SheetFooter className="items-center justify-end border-t">
            <span className="mr-auto text-sm text-accent">Unsaved changes</span>
            <Button
              variant="ghost"
              onClick={requestStopEditing}
              isDisabled={publishVersion.isPending}
            >
              Discard
            </Button>
            <Button
              variant="av"
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
              viewedVersion={version ?? skill.latestVersion}
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
            newerVersion={
              edit && skill.latestVersion > edit.baseVersion ? skill.latestVersion : null
            }
            changes={changes}
            isPending={publishVersion.isPending}
            onSave={handleSave}
          />
        </>
      )}

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

  const publishVersion = usePublishAgentVaultSkillVersion();
  const requestCloseRef = useRef<() => void>(closeSheet);

  return (
    <Sheet open={Boolean(skillId)} onOpenChange={(open) => !open && requestCloseRef.current()}>
      <SheetContent
        size="wide"
        className="flex h-full max-h-full w-full flex-col gap-y-0"
        isPending={publishVersion.isPending}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={keepOpenOnNameInputEscape}
      >
        <SkillSheetBody
          key={shownSkillId}
          shownSkillId={shownSkillId}
          closeSheet={closeSheet}
          publishVersion={publishVersion}
          registerRequestClose={(requestClose) => {
            requestCloseRef.current = requestClose;
          }}
        />
      </SheetContent>
    </Sheet>
  );
};
