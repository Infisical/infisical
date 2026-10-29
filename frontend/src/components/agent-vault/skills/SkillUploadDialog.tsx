import { useMemo, useRef, useState } from "react";
import { FileTextIcon, RotateCwIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DiscardChangesAlertDialog,
  FileDropzone
} from "@app/components/v3";
import {
  base64ToBytes,
  carrySkillFileModes,
  decodeSkillFile,
  formatSkillBytes,
  getSkillEntryName,
  readSkillUpload,
  replaceSkillEntryFile,
  SKILL_ENTRY_FILE,
  SkillPackageError,
  sortSkillFiles
} from "@app/helpers/agentVaultSkills";
import { useDiscardChangesGuard } from "@app/hooks";
import {
  SkillVersionConflictError,
  useGetAgentVaultSkillVersion,
  useUpdateAgentVaultSkill
} from "@app/hooks/api/agentVault";
import { TAgentVaultSkill, TAgentVaultSkillFile } from "@app/hooks/api/agentVault/types";

type TUploadState =
  | { status: "empty" }
  | { status: "reading"; file: File }
  | { status: "ready"; file: File; files: TAgentVaultSkillFile[]; isEntryOnly: boolean }
  | { status: "invalid"; file: File; message: string };

export type TSkillUpload = { files: TAgentVaultSkillFile[]; isEntryOnly: boolean };

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
} & (
  | {
      /** Publishes the upload as a new version of this skill. */
      skill: Pick<TAgentVaultSkill, "id" | "name" | "latestVersion">;
      onSaved?: () => void;
      onLoad?: never;
    }
  | {
      skill?: never;
      onSaved?: never;
      /** Hands the files back, for an editor to show before anything is saved. */
      onLoad: (upload: TSkillUpload) => void;
    }
);

export const SkillUploadDialog = ({ isOpen, onOpenChange, skill, onSaved, onLoad }: Props) => {
  const updateSkill = useUpdateAgentVaultSkill();
  const latest = useGetAgentVaultSkillVersion(
    isOpen && skill ? skill.id : "",
    skill?.latestVersion
  );
  const [upload, setUpload] = useState<TUploadState>({ status: "empty" });
  // The latest version a refused save reported; saving again then goes ahead without the version check.
  const [conflictVersion, setConflictVersion] = useState<number | null>(null);
  // A file on a cloud or network drive can take seconds to read; a read that outlives its upload is dropped.
  const readIdRef = useRef(0);

  // A new version keeps the modes the previous one gave each path, and a lone .md replaces only SKILL.md.
  const filesToPublish = useMemo(() => {
    if (upload.status !== "ready") return [];
    if (!skill || !latest.data) return upload.files;
    return sortSkillFiles(
      upload.isEntryOnly
        ? replaceSkillEntryFile(latest.data.files, upload.files[0])
        : carrySkillFileModes(upload.files, latest.data.files)
    );
  }, [upload, skill, latest.data]);

  const close = () => {
    readIdRef.current += 1;
    setUpload({ status: "empty" });
    setConflictVersion(null);
    onOpenChange(false);
  };

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty: upload.status !== "empty", onDiscard: close });

  const selectFile = async (file?: File) => {
    readIdRef.current += 1;
    setConflictVersion(null);
    const readId = readIdRef.current;
    if (!file) {
      setUpload({ status: "empty" });
      return;
    }
    setUpload({ status: "reading", file });
    try {
      const files = await readSkillUpload(file);
      if (readId !== readIdRef.current) return;
      // Creating: the editor is the review step, so the files go straight there.
      if (!skill) {
        onLoad?.({
          files: sortSkillFiles(files),
          isEntryOnly: file.name.toLowerCase().endsWith(".md")
        });
        close();
        return;
      }
      setUpload({
        status: "ready",
        file,
        files: sortSkillFiles(files),
        isEntryOnly: file.name.toLowerCase().endsWith(".md")
      });
    } catch (error) {
      if (readId !== readIdRef.current) return;
      setUpload({
        status: "invalid",
        file,
        message: error instanceof SkillPackageError ? error.message : "This file could not be read."
      });
    }
  };

  const handleSubmit = async () => {
    if (upload.status !== "ready" || !skill) return;
    try {
      const {
        skill: saved,
        version,
        unchanged
      } = await updateSkill.mutateAsync({
        skillId: skill.id,
        files: filesToPublish,
        ...(conflictVersion === null && latest.data && { baseVersion: latest.data.version })
      });
      createNotification({
        text: unchanged
          ? `No changes. Version ${version.version} of "${saved.name}" already has these files.`
          : `Saved version ${version.version} of "${saved.name}"`,
        type: unchanged ? "info" : "success"
      });
      onSaved?.();
      close();
    } catch (error) {
      if (error instanceof SkillVersionConflictError) setConflictVersion(error.latestVersion);
      // Any other failure is shown by the global mutation handler.
    }
  };

  const uploadedEntry = filesToPublish.find((file) => file.path === SKILL_ENTRY_FILE);
  const uploadedName = uploadedEntry && getSkillEntryName(decodeSkillFile(uploadedEntry));
  const renamedTo = skill && uploadedName && uploadedName !== skill.name ? uploadedName : null;

  const uploadedPaths = new Set(upload.status === "ready" ? upload.files.map((f) => f.path) : []);
  const hasLatestError = Boolean(skill) && latest.isError;
  const isWaitingForLatest = Boolean(skill) && !latest.data;
  const { isPending } = updateSkill;

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(next) => {
          if (next) onOpenChange(true);
          else requestDiscard();
        }}
      >
        <DialogContent className="sm:max-w-xl" isPending={isPending}>
          <DialogHeader>
            <DialogTitle>{skill ? "Upload New Version" : "Upload Skill"}</DialogTitle>
            {!skill && (
              <DialogDescription>
                Pick a .zip or .md file. Its files fill the editor, and nothing is saved until you
                create the skill.
              </DialogDescription>
            )}
          </DialogHeader>

          {hasLatestError && (
            <Alert variant="danger">
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                Couldn&apos;t load the current version of this skill.
                <Button
                  variant="outline"
                  size="xs"
                  isPending={latest.isFetching}
                  onClick={() => latest.refetch()}
                >
                  <RotateCwIcon />
                  Try Again
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <FileDropzone
            accept=".zip,.md"
            files={upload.status === "empty" ? undefined : [upload.file]}
            onFilesSelect={(files) => selectFile(files[0])}
            onFileRemove={() => selectFile()}
            isDisabled={isPending}
            description={
              skill
                ? `A .zip replaces every file. A single .md file replaces only ${SKILL_ENTRY_FILE}.`
                : `A .zip of the skill's folder replaces every file in the editor. A single .md file replaces only ${SKILL_ENTRY_FILE}.`
            }
          />

          {upload.status === "invalid" && (
            <Alert variant="danger">
              <AlertDescription>{upload.message}</AlertDescription>
            </Alert>
          )}

          {upload.status === "ready" && conflictVersion !== null && (
            <Alert variant="warning">
              <AlertDescription>
                A newer version (v{conflictVersion}) was published while you were uploading. Saving
                will make your version the latest.
              </AlertDescription>
            </Alert>
          )}

          {upload.status === "ready" && renamedTo && (
            <Alert variant="info">
              <AlertDescription>
                This will rename the skill from {skill?.name} to {renamedTo}.
              </AlertDescription>
            </Alert>
          )}

          {upload.status === "ready" && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-accent">
                {filesToPublish.length} file{filesToPublish.length === 1 ? "" : "s"}
                {skill ? " in the new version" : ""}
              </p>
              <ul className="flex max-h-48 thin-scrollbar flex-col gap-1.5 overflow-y-auto rounded-md border border-border bg-container/50 p-3">
                {filesToPublish.map((file) => (
                  <li key={file.path} className="flex items-center gap-2 text-sm">
                    <FileTextIcon className="size-3.5 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate">{file.path}</span>
                    {skill && !uploadedPaths.has(file.path) && (
                      <Badge variant="neutral">Kept</Badge>
                    )}
                    {file.mode === "0755" && <Badge variant="neutral">Executable</Badge>}
                    <span className="shrink-0 text-xs text-muted">
                      {formatSkillBytes(base64ToBytes(file.contentBase64).length)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={requestDiscard} isDisabled={isPending}>
              Cancel
            </Button>
            {skill && (
              <Button
                variant="av"
                isPending={isPending}
                isDisabled={upload.status !== "ready" || isWaitingForLatest}
                onClick={handleSubmit}
              >
                {conflictVersion === null ? "Save Version" : "Save Anyway"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Upload?"
        description="The file you picked will not be used."
      />
    </>
  );
};
