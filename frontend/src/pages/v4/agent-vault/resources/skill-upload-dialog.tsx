import { useMemo, useRef, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { Alert } from "@infisical/cipher/ui/alert";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Meta } from "@infisical/cipher/ui/text";

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
import { SkillVersionConflictError } from "@app/hooks/api/agentVault/mutations";
import type { TAgentVaultSkillFile } from "@app/hooks/api/agentVault/types";

import { failed, saved, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";

import styles from "./skills.module.css";

export type TSkillUpload = { files: TAgentVaultSkillFile[]; isEntryOnly: boolean };

type TUploadState =
  | { status: "empty" }
  | { status: "reading"; file: File }
  | { status: "ready"; file: File; files: TAgentVaultSkillFile[]; isEntryOnly: boolean }
  | { status: "invalid"; file: File; message: string };

type TSkillTarget = { id: string; name: string; latestVersion: number };

const planUpload = (
  upload: TUploadState,
  latestFiles: TAgentVaultSkillFile[] | undefined,
  skillName: string | undefined
) => {
  if (upload.status !== "ready")
    return { filesToPublish: [], uploadedPaths: new Set<string>(), renamedTo: null };
  let filesToPublish = upload.files;
  if (skillName && latestFiles)
    filesToPublish = sortSkillFiles(
      upload.isEntryOnly
        ? replaceSkillEntryFile(latestFiles, upload.files[0])
        : carrySkillFileModes(upload.files, latestFiles)
    );
  const entry = filesToPublish.find((file) => file.path === SKILL_ENTRY_FILE);
  const entryName = entry && getSkillEntryName(decodeSkillFile(entry));
  return {
    filesToPublish,
    uploadedPaths: new Set(upload.files.map((file) => file.path)),
    renamedTo: skillName && entryName && entryName !== skillName ? entryName : null
  };
};

const UploadNotices = ({
  conflict,
  from,
  renamedTo
}: {
  conflict?: number;
  from?: string;
  renamedTo: string | null;
}) => (
  <>
    {conflict !== undefined && (
      <Alert tone="warn">
        {`v${conflict} was published while you were uploading. Saving makes your version the latest.`}
      </Alert>
    )}
    {renamedTo && (
      <Alert tone="info">{`This renames the skill from ${from} to ${renamedTo}.`}</Alert>
    )}
  </>
);

const PickedFile = ({
  file,
  reading,
  disabled,
  onPick,
  onRemove
}: {
  file?: File;
  reading: boolean;
  disabled: boolean;
  onPick: () => void;
  onRemove: () => void;
}) =>
  file ? (
    <div className={styles.uploadItem}>
      <Icon name="file" />
      <span className={styles.uploadName} title={file.name}>
        {file.name}
      </span>
      <Meta>{formatSkillBytes(file.size)}</Meta>
      <Button
        variant="ghost"
        size="icon-sm"
        icon="x"
        iconOnly
        aria-label={`Remove ${file.name}`}
        disabled={disabled}
        loading={reading}
        onClick={onRemove}
      />
    </div>
  ) : (
    <Inline gap={8}>
      <Button variant="outline" icon="upload" disabled={disabled} onClick={onPick}>
        Choose a .zip or .md file
      </Button>
    </Inline>
  );

const UploadedFiles = ({
  files,
  uploadedPaths
}: {
  files: TAgentVaultSkillFile[];
  uploadedPaths: ReadonlySet<string>;
}) => (
  <Stack gap={8}>
    <Meta>
      {files.length === 1
        ? "1 file in the new version"
        : `${files.length} files in the new version`}
    </Meta>
    <ul className={styles.uploadList}>
      {files.map((file) => (
        <li key={file.path} className={styles.uploadItem}>
          <Icon name="file-text" />
          <span className={styles.uploadName} title={file.path}>
            {file.path}
          </span>
          {!uploadedPaths.has(file.path) && <Badge tone="soft">Kept</Badge>}
          {file.mode === "0755" && <Badge tone="soft">Executable</Badge>}
          <Meta>{formatSkillBytes(base64ToBytes(file.contentBase64).length)}</Meta>
        </li>
      ))}
    </ul>
  </Stack>
);

export const SkillUploadDialog = ({
  projectId,
  skill,
  onOpenChange,
  onLoad,
  onSaved
}: {
  projectId: string;
  onOpenChange: (open: boolean) => void;
} & (
  | { skill: TSkillTarget; onSaved?: () => void; onLoad?: never }
  | { skill?: never; onSaved?: never; onLoad: (upload: TSkillUpload) => void }
)) => {
  const resources = useV4Adapter("agentVaultResources");
  const update = resources.useUpdateSkill(projectId);
  const latest = resources.useSkillVersion(projectId, skill?.id ?? "", skill?.latestVersion);
  const [upload, setUpload] = useState<TUploadState>({ status: "empty" });
  const [conflict, setConflict] = useState<number>();
  const [pending, setPending] = useState(false);
  const readId = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const { filesToPublish, uploadedPaths, renamedTo } = useMemo(
    () => planUpload(upload, latest.data?.files, skill?.name),
    [upload, latest.data, skill?.name]
  );

  const close = () => {
    readId.current += 1;
    onOpenChange(false);
  };
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: upload.status !== "empty",
    onDiscard: close
  });

  const selectFile = async (file?: File) => {
    readId.current += 1;
    const { current } = readId;
    setConflict(undefined);
    if (fileInput.current) fileInput.current.value = "";
    if (!file) {
      setUpload({ status: "empty" });
      return;
    }
    setUpload({ status: "reading", file });
    try {
      const files = sortSkillFiles(await readSkillUpload(file));
      if (current !== readId.current) return;
      const isEntryOnly = file.name.toLowerCase().endsWith(".md");
      if (!skill) {
        onLoad({ files, isEntryOnly });
        close();
        return;
      }
      setUpload({ status: "ready", file, files, isEntryOnly });
    } catch (error) {
      if (current !== readId.current) return;
      setUpload({
        status: "invalid",
        file,
        message: error instanceof SkillPackageError ? error.message : "This file could not be read."
      });
    }
  };

  const publish = async () => {
    if (upload.status !== "ready" || !skill) return;
    setPending(true);
    try {
      const result = await update.mutateAsync({
        skillId: skill.id,
        files: filesToPublish,
        ...(conflict === undefined && latest.data && { baseVersion: latest.data.version })
      });
      if (result.unchanged)
        toast({
          tone: "neutral",
          title: `No changes. Version ${result.version.version} of ${result.skill.name} already has these files.`
        });
      else saved(`Saved version ${result.version.version} of ${result.skill.name}`);
      onSaved?.();
      close();
    } catch (error) {
      if (error instanceof SkillVersionConflictError) setConflict(error.latestVersion);
      failed("Failed to save skill", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && requestDiscard()}>
        <DialogContent pending={pending}>
          <DialogHeader>
            <DialogTitle>{skill ? "Upload new version" : "Upload skill"}</DialogTitle>
          </DialogHeader>
          <Stack gap={16}>
            {skill && Boolean(latest.error) && (
              <Alert tone="bad">Couldn&apos;t load the current version of this skill.</Alert>
            )}
            <Field
              label="File"
              description={
                skill
                  ? `A .zip replaces every file. A single .md file replaces only ${SKILL_ENTRY_FILE}.`
                  : `A .zip of the skill's folder replaces every file in the editor. A single .md file replaces only ${SKILL_ENTRY_FILE}.`
              }
              error={upload.status === "invalid" ? upload.message : undefined}
              wide
            >
              <input
                ref={fileInput}
                type="file"
                accept=".zip,.md"
                hidden
                onChange={(event) => selectFile(event.target.files?.[0])}
              />
              <PickedFile
                file={upload.status === "empty" ? undefined : upload.file}
                reading={upload.status === "reading"}
                disabled={pending}
                onPick={() => fileInput.current?.click()}
                onRemove={() => selectFile()}
              />
            </Field>
            {upload.status === "ready" && (
              <UploadNotices conflict={conflict} from={skill?.name} renamedTo={renamedTo} />
            )}
            {upload.status === "ready" && (
              <UploadedFiles files={filesToPublish} uploadedPaths={uploadedPaths} />
            )}
          </Stack>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={requestDiscard}>
              Cancel
            </Button>
            {skill && (
              <Button
                variant="primary"
                loading={pending}
                disabled={upload.status !== "ready" || !latest.data}
                onClick={publish}
              >
                {conflict === undefined ? "Save version" : "Save anyway"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesAlertDialog {...discardDialogProps} />
    </>
  );
};
