import { type Dispatch, type SetStateAction, useMemo, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { Alert } from "@infisical/cipher/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DiscardChangesAlertDialog
} from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@infisical/cipher/ui/dropdown-menu";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Heading, Meta } from "@infisical/cipher/ui/text";

import {
  formatSkillBytes,
  fromDraftFiles,
  getChangedSkillPaths,
  getReservedSkillNameMessage,
  getSkillFileChanges,
  getSkillHeaderError,
  getSkillHeaderText,
  isReservedSkillName,
  newDraftFile,
  parseSkillHeader,
  setSkillHeaderValue,
  SKILL_DESCRIPTION_MAX_LENGTH,
  SKILL_ENTRY_FILE,
  SKILL_NAME_MAX_LENGTH,
  SKILL_NAME_MESSAGE,
  SKILL_NAME_RE,
  sortSkillFiles,
  splitFrontmatter,
  toDraftFiles,
  type TSkillDraftFile,
  type TSkillFileChange
} from "@app/helpers/agentVaultSkills";
import { SkillVersionConflictError } from "@app/hooks/api/agentVault/mutations";
import type {
  TAgentVaultSkillDetail,
  TAgentVaultSkillFile,
  TAgentVaultSkillVersion
} from "@app/hooks/api/agentVault/types";

import { failed, saved, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { DateCell } from "./shared";
import { downloadSkillVersion } from "./skill-download";
import { SkillFilesEditor } from "./skill-files-editor";
import { SaveSkillVersionSheet } from "./skill-review-sheet";
import { SkillUploadDialog, type TSkillUpload } from "./skill-upload-dialog";

import styles from "./skills.module.css";

const HEADER_KEYS = ["name", "description"] as const;
type THeaderFields = Record<(typeof HEADER_KEYS)[number], string>;

const withHeader = (text: string, values: THeaderFields) =>
  HEADER_KEYS.reduce((next, key) => setSkillHeaderValue(next, key, values[key]), text);

const toFieldText = (value: unknown) =>
  getSkillHeaderText(value)
    .replace(/\n+$/, "")
    .replace(/[ \t]*\n[ \t]*/g, " ");

const readHeaderFields = (text: string): THeaderFields | null => {
  const { frontmatter } = splitFrontmatter(text);
  const header = frontmatter === null ? null : parseSkillHeader(frontmatter);
  if (!header) return null;
  return { name: getSkillHeaderText(header.name), description: toFieldText(header.description) };
};

const getEntryText = (files: TSkillDraftFile[]) =>
  files.find((file) => file.path === SKILL_ENTRY_FILE)?.text ?? "";

const setEntryText = (files: TSkillDraftFile[], text: string) =>
  files.map((file) => (file.path === SKILL_ENTRY_FILE ? { ...file, text } : file));

const getNameError = (name: string) => {
  if (!name) return "Enter a name.";
  if (name.length > SKILL_NAME_MAX_LENGTH)
    return `A name can be at most ${SKILL_NAME_MAX_LENGTH} characters.`;
  if (!SKILL_NAME_RE.test(name)) return SKILL_NAME_MESSAGE;
  if (isReservedSkillName(name)) return getReservedSkillNameMessage(name);
  return undefined;
};

const getDescriptionError = (description: string) => {
  if (!description.trim()) return "Describe when an agent should use this skill.";
  if (description.trim().length > SKILL_DESCRIPTION_MAX_LENGTH)
    return `A description can be at most ${SKILL_DESCRIPTION_MAX_LENGTH} characters.`;
  return undefined;
};

const VersionPending = ({
  failed: hasFailed,
  retrying,
  onRetry
}: {
  failed: boolean;
  retrying: boolean;
  onRetry?: () => unknown;
}) =>
  hasFailed ? (
    <EmptyState
      size="sm"
      media="bare"
      icon="alert"
      title="Couldn't load this version"
      actions={
        onRetry ? (
          <Button variant="outline" icon="sync" loading={retrying} onClick={() => onRetry()}>
            Try again
          </Button>
        ) : undefined
      }
    />
  ) : (
    <Loader label="Loading version" />
  );

const SaveActions = ({
  hasChanges,
  saving,
  onDiscard,
  onSave
}: {
  hasChanges: boolean;
  saving: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) => (
  <Inline gap={8} align="center">
    {hasChanges && (
      <span className={styles.unsaved}>
        <span className={styles.dot} aria-hidden />
        Unsaved changes
      </span>
    )}
    <Button variant="outline" disabled={!hasChanges || saving} onClick={onDiscard}>
      Discard
    </Button>
    <Button variant="primary" disabled={!hasChanges} onClick={onSave}>
      Save version
    </Button>
  </Inline>
);

const OlderVersionAlert = ({
  viewed,
  latest,
  canRollBack,
  loaded,
  onRollBack,
  onViewLatest
}: {
  viewed: number | null;
  latest: number;
  canRollBack: boolean;
  loaded: boolean;
  onRollBack: () => void;
  onViewLatest: () => void;
}) => (
  <Alert
    tone="info"
    actions={
      <Inline gap={8}>
        {canRollBack && (
          <Button
            variant="outline"
            size="sm"
            icon="history"
            disabled={!loaded}
            onClick={onRollBack}
          >
            Roll back to this version
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onViewLatest}>
          View latest
        </Button>
      </Inline>
    }
  >
    {`You are viewing v${viewed}. Agents get v${latest}.`}
  </Alert>
);

export const CreateSkillDialog = ({
  projectId,
  initialName = "",
  onCreated,
  onOpenChange
}: {
  projectId: string;
  initialName?: string;
  onCreated?: (skill: { id: string; name: string }) => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
}) => {
  const create = useV4Adapter("agentVaultResources").useCreateSkill(projectId);
  const initialFiles = useMemo(
    () => [newDraftFile(SKILL_ENTRY_FILE, withHeader("", { name: initialName, description: "" }))],
    [initialName]
  );
  const [fields, setFields] = useState<THeaderFields>({ name: initialName, description: "" });
  const [files, setFiles] = useState(initialFiles);
  const [selectedPath, setSelectedPath] = useState(SKILL_ENTRY_FILE);
  const [errors, setErrors] = useState<Partial<Record<"name" | "description" | "files", string>>>(
    {}
  );
  const [uploading, setUploading] = useState(false);
  const [pending, setPending] = useState(false);
  const dirty =
    fields.name !== initialName || Boolean(fields.description) || files !== initialFiles;
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: dirty,
    onDiscard: () => onOpenChange(false)
  });

  const entryHeader = splitFrontmatter(getEntryText(files)).frontmatter;
  const headerError = entryHeader === null ? null : getSkillHeaderError(entryHeader);
  const changedPaths = useMemo(
    () =>
      new Set(
        files
          .filter((file) => file.path !== SKILL_ENTRY_FILE || file.text !== initialFiles[0].text)
          .map((file) => file.path)
      ),
    [files, initialFiles]
  );

  const syncFieldsFromHeader = (text: string) => {
    const next = readHeaderFields(text);
    if (next) setFields(next);
  };

  const changeField = (key: (typeof HEADER_KEYS)[number], value: string) => {
    const nextText = setSkillHeaderValue(getEntryText(files), key, value);
    if (headerError) syncFieldsFromHeader(nextText);
    setFields((prev) => ({ ...prev, [key]: value }));
    setFiles((prev) => setEntryText(prev, setSkillHeaderValue(getEntryText(prev), key, value)));
    setErrors((prev) => ({ ...prev, [key]: undefined, files: undefined }));
  };

  const changeFiles = (next: TSkillDraftFile[]) => {
    const text = getEntryText(next);
    if (text !== getEntryText(files)) syncFieldsFromHeader(text);
    setFiles(next);
    setErrors((prev) => ({ ...prev, files: undefined }));
  };

  const loadUpload = ({ files: uploaded, isEntryOnly }: TSkillUpload) => {
    const drafts = toDraftFiles(uploaded);
    const next = isEntryOnly
      ? [drafts[0], ...files.filter((file) => file.path !== SKILL_ENTRY_FILE)]
      : drafts;
    const entry = next.find((file) => file.path === SKILL_ENTRY_FILE);
    let withEntry: TSkillDraftFile[];
    if (entry?.text && splitFrontmatter(entry.text).frontmatter !== null) {
      syncFieldsFromHeader(entry.text);
      withEntry = next;
    } else if (entry && entry.text !== null) {
      withEntry = setEntryText(next, withHeader(entry.text, fields));
    } else {
      withEntry = [
        newDraftFile(SKILL_ENTRY_FILE, withHeader("", fields)),
        ...next.filter((file) => file.path !== SKILL_ENTRY_FILE)
      ];
    }
    setFiles(sortSkillFiles(withEntry));
    setSelectedPath(SKILL_ENTRY_FILE);
    setErrors({});
  };

  const submit = async () => {
    if (headerError) {
      setSelectedPath(SKILL_ENTRY_FILE);
      setErrors({ files: headerError });
      return;
    }
    const text = getEntryText(files);
    const { frontmatter, body } = splitFrontmatter(text);
    const header = frontmatter === null ? {} : parseSkillHeader(frontmatter);
    const next = {
      name: getNameError(fields.name),
      description: getDescriptionError(fields.description),
      files: body.trim() ? undefined : `Write the instructions in ${SKILL_ENTRY_FILE}.`
    };
    setErrors(next);
    if (!header || Object.values(next).some(Boolean)) {
      if (next.files) setSelectedPath(SKILL_ENTRY_FILE);
      return;
    }
    const entryText = HEADER_KEYS.reduce(
      (current, key) =>
        header[key] === fields[key] ||
        (key === "description" &&
          typeof header[key] === "string" &&
          toFieldText(header[key]) === fields[key])
          ? current
          : setSkillHeaderValue(current, key, fields[key]),
      text
    );
    setPending(true);
    try {
      const { skill } = await create.mutateAsync({
        files: fromDraftFiles(setEntryText(files, entryText))
      });
      saved(`Skill ${skill.name} created`);
      await onCreated?.(skill);
      onOpenChange(false);
    } catch (error) {
      failed("Failed to create skill", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && requestDiscard()}>
        <SheetContent size="lg" pending={pending}>
          <SheetHeader>
            <SheetTitle>Create skill</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <form
              id="agent-vault-create-skill"
              autoComplete="off"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <Stack gap={16}>
                <Field label="Name" error={errors.name} wide>
                  <Input
                    value={fields.name}
                    maxLength={SKILL_NAME_MAX_LENGTH}
                    placeholder="code-review"
                    spellCheck={false}
                    invalid={Boolean(errors.name)}
                    onChange={(event) => changeField("name", event.target.value)}
                  />
                </Field>
                <Field
                  label="Description"
                  description="Agents read this to decide when to use the skill."
                  error={errors.description}
                  wide
                >
                  <Input
                    value={fields.description}
                    maxLength={SKILL_DESCRIPTION_MAX_LENGTH}
                    invalid={Boolean(errors.description)}
                    onChange={(event) => changeField("description", event.target.value)}
                  />
                </Field>
                <Field
                  group
                  label="Files"
                  error={errors.files ?? headerError ?? undefined}
                  help={
                    <Button
                      variant="outline"
                      size="sm"
                      icon="upload"
                      disabled={pending}
                      onClick={() => setUploading(true)}
                    >
                      Upload
                    </Button>
                  }
                  wide
                >
                  <SkillFilesEditor
                    files={files}
                    selectedPath={selectedPath}
                    onSelect={setSelectedPath}
                    editable
                    onChange={changeFiles}
                    changedPaths={changedPaths}
                  />
                </Field>
              </Stack>
            </form>
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" disabled={pending} onClick={requestDiscard}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              form="agent-vault-create-skill"
              loading={pending}
            >
              Create skill
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      {uploading && (
        <SkillUploadDialog projectId={projectId} onOpenChange={setUploading} onLoad={loadUpload} />
      )}
      <DiscardChangesAlertDialog {...discardDialogProps} />
    </>
  );
};

export const DeleteSkillDialog = ({
  projectId,
  skill,
  onOpenChange,
  onDeleted
}: {
  projectId: string;
  skill?: { id: string; name: string };
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}) => {
  const remove = useV4Adapter("agentVaultResources").useDeleteSkill(projectId);
  return (
    <AlertDialog open={Boolean(skill)} onOpenChange={onOpenChange}>
      <AlertDialogContent tone="danger" confirmText={skill?.name}>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Delete ${skill?.name ?? ""}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            It leaves every access bundle it&apos;s in and every version is deleted. Agents that
            already started keep their copy. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={async () => {
              if (!skill) return;
              try {
                await remove.mutateAsync(skill.id);
                saved(`Skill ${skill.name} deleted`);
                onOpenChange(false);
                onDeleted?.();
              } catch (error) {
                failed("Failed to delete skill", error);
              }
            }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const SkillVersionsTable = ({
  skill,
  versions,
  loading,
  viewed,
  disabled,
  onView
}: {
  skill: { name: string; latestVersion: number };
  versions: TAgentVaultSkillVersion[];
  loading: boolean;
  viewed: number | null;
  disabled: boolean;
  onView: (version: number) => void;
}) => {
  const columns: DataTableColumn<TAgentVaultSkillVersion>[] = [
    {
      id: "version",
      header: "Version",
      width: 96,
      render: (version) => (
        <Button
          variant="link"
          underline="hover"
          disabled={disabled}
          onClick={() => onView(version.version)}
        >
          {`v${version.version}${version.version === skill.latestVersion ? " (latest)" : ""}`}
        </Button>
      )
    },
    {
      id: "created",
      header: "Published",
      grow: true,
      render: (version) => <DateCell value={version.createdAt} />
    },
    {
      id: "files",
      header: "Files",
      width: 72,
      align: "end",
      render: (version) => <span>{version.fileCount}</span>
    },
    {
      id: "size",
      header: "Size",
      width: 96,
      align: "end",
      render: (version) => <Meta>{formatSkillBytes(version.sizeBytes)}</Meta>
    }
  ];
  return (
    <DataTable
      label={`Versions of ${skill.name}`}
      rows={versions}
      columns={columns}
      getRowId={(version) => version.id}
      rowLabel={(version) => `v${version.version}`}
      loading={loading}
      loadingRows={2}
      focusedRowId={
        versions.find((version) => version.version === (viewed ?? skill.latestVersion))?.id
      }
    />
  );
};

const RollBackSkillDialog = ({
  projectId,
  skill,
  version,
  onClose,
  onRolledBack
}: {
  projectId: string;
  skill: { id: string; name: string };
  version?: number;
  onClose: () => void;
  onRolledBack: () => void;
}) => {
  const restore = useV4Adapter("agentVaultResources").useRestoreSkillVersion(projectId);
  return (
    <AlertDialog open={version !== undefined} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{`Roll back to v${version ?? ""}?`}</AlertDialogTitle>
          <AlertDialogDescription>
            Its files are published as a new version, and agents get them the next time they start.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={async () => {
              if (version === undefined) return;
              try {
                const result = await restore.mutateAsync({ skillId: skill.id, version });
                if (result.unchanged)
                  toast({ tone: "neutral", title: "This version already matches the latest." });
                else
                  saved(`Rolled ${skill.name} back to v${version} as v${result.version.version}`);
                onRolledBack();
              } catch (error) {
                failed("Failed to roll back skill", error);
              }
              onClose();
            }}
          >
            Roll back
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const SkillOptionsMenu = ({
  skillName,
  version,
  isOlder,
  locked,
  canUpload,
  canDelete,
  onUpload,
  onDelete
}: {
  skillName: string;
  version?: { version: number; files: TAgentVaultSkillFile[] };
  isOlder: boolean;
  locked: boolean;
  canUpload: boolean;
  canDelete: boolean;
  onUpload: () => void;
  onDelete: () => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button
        variant="outline"
        layout="trigger"
        disabled={locked}
        disabledReason={locked ? "Save or discard your changes first." : undefined}
      >
        Options
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start">
      {canUpload && (
        <DropdownMenuItem onSelect={onUpload}>
          <Icon name="upload" />
          Upload new version
        </DropdownMenuItem>
      )}
      <DropdownMenuItem
        disabled={!version}
        onSelect={() => version && downloadSkillVersion(skillName, version)}
      >
        <Icon name="download" />
        {version && isOlder ? `Download v${version.version}` : "Download"}
      </DropdownMenuItem>
      {canDelete && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Icon name="trash" />
            Delete skill
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
  </DropdownMenu>
);

type TSkillEdit = {
  skillId: string;
  baseVersion: number;
  base: TSkillDraftFile[];
  draft: TSkillDraftFile[];
};

type TSkillSheetProps = {
  projectId: string;
  canEdit: boolean;
  canDelete: boolean;
  edit?: TSkillEdit;
  setEdit: Dispatch<SetStateAction<TSkillEdit | undefined>>;
  saving: boolean;
  setSaving: (saving: boolean) => void;
  onClose: () => void;
};

const SkillSheetEditor = ({
  projectId,
  skill,
  canEdit,
  canDelete,
  edit,
  setEdit,
  saving,
  setSaving,
  onClose
}: TSkillSheetProps & { skill: TAgentVaultSkillDetail }) => {
  const resources = useV4Adapter("agentVaultResources");
  const skillId = skill.id;
  const { data: versions = [], isPending: isVersionsPending } = resources.useSkillVersions(
    projectId,
    skillId
  );
  const update = resources.useUpdateSkill(projectId);
  const [viewed, setViewed] = useState<number | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(SKILL_ENTRY_FILE);
  const [rollingBack, setRollingBack] = useState<number>();
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewChanges, setReviewChanges] = useState<TSkillFileChange[]>([]);
  const [conflict, setConflict] = useState<number>();

  const isOlder = viewed !== null && viewed !== skill.latestVersion;
  const olderVersionQuery = resources.useSkillVersion(
    projectId,
    skillId,
    isOlder ? viewed : undefined
  );
  const olderVersion = olderVersionQuery.data;
  const latestFiles = useMemo(() => toDraftFiles(skill.files), [skill]);
  const editable = canEdit && !isOlder;
  const shownFiles = useMemo(() => {
    if (isOlder) return toDraftFiles(olderVersion?.files ?? []);
    return edit ? edit.draft : latestFiles;
  }, [isOlder, olderVersion, edit, latestFiles]);
  const { changedPaths, hasChanges } = useMemo(
    () =>
      edit
        ? getChangedSkillPaths(edit.base, edit.draft)
        : { changedPaths: new Set<string>(), hasChanges: false },
    [edit]
  );
  const discardablePaths = useMemo(() => {
    const savedPaths = new Set(edit?.base.map((file) => file.path));
    return new Set([...changedPaths].filter((path) => savedPaths.has(path)));
  }, [edit, changedPaths]);
  const { requestDiscard: requestDiscardEdits, discardDialogProps } = useDiscardChangesGuard({
    isDirty: hasChanges,
    onDiscard: () => setEdit(undefined)
  });

  const latestKnownVersion = Math.max(skill.latestVersion, conflict ?? 0);
  const newerVersion = edit && latestKnownVersion > edit.baseVersion ? latestKnownVersion : null;
  const shownVersion = isOlder
    ? olderVersion
    : { version: skill.latestVersion, files: skill.files };

  const changeFiles = (draft: TSkillDraftFile[]) =>
    setEdit((prev) => {
      const current = (prev?.skillId === skill.id ? prev : undefined) ?? {
        skillId: skill.id,
        baseVersion: skill.latestVersion,
        base: latestFiles,
        draft: latestFiles
      };
      return { ...current, draft };
    });

  const discardFile = (path: string) =>
    setEdit((prev) => {
      const savedFile = prev?.base.find((file) => file.path === path);
      if (!prev || !savedFile) return prev;
      return {
        ...prev,
        draft: prev.draft.map((file) => (file.path === path ? savedFile : file))
      };
    });

  const save = async () => {
    if (!edit) return;
    setSaving(true);
    try {
      const { version, unchanged } = await update.mutateAsync({
        skillId: skill.id,
        files: fromDraftFiles(edit.draft),
        ...(newerVersion === null && { baseVersion: edit.baseVersion })
      });
      if (unchanged)
        toast({
          tone: "neutral",
          title: `No changes. Version ${version.version} already has these files.`
        });
      else saved(`Saved version ${version.version} of ${skill.name}`);
      setConflict(undefined);
      setReviewing(false);
      setEdit(undefined);
      setViewed(null);
    } catch (error) {
      if (error instanceof SkillVersionConflictError) setConflict(error.latestVersion);
      failed("Failed to save skill", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle>{skill.name}</SheetTitle>
        <SheetDescription>{skill.description}</SheetDescription>
      </SheetHeader>
      <SheetBody>
        <Stack gap={24}>
          {isOlder && (
            <OlderVersionAlert
              viewed={viewed}
              latest={skill.latestVersion}
              canRollBack={canEdit}
              loaded={Boolean(olderVersion)}
              onRollBack={() => setRollingBack(viewed ?? undefined)}
              onViewLatest={() => setViewed(null)}
            />
          )}
          <Stack gap={8}>
            <Heading level={3} size="subsection">
              Files
            </Heading>
            {isOlder && !olderVersion ? (
              <VersionPending
                failed={Boolean(olderVersionQuery.error)}
                retrying={Boolean(olderVersionQuery.isFetching)}
                onRetry={olderVersionQuery.refetch}
              />
            ) : (
              <SkillFilesEditor
                key={shownVersion?.version}
                files={shownFiles}
                selectedPath={selectedPath}
                onSelect={setSelectedPath}
                editable={editable}
                onChange={changeFiles}
                changedPaths={changedPaths}
                discardablePaths={discardablePaths}
                onDiscardFile={discardFile}
              />
            )}
          </Stack>
          <Stack gap={8}>
            <Heading level={3} size="subsection">
              Versions
            </Heading>
            <SkillVersionsTable
              skill={skill}
              versions={versions}
              loading={isVersionsPending}
              viewed={viewed}
              disabled={hasChanges}
              onView={setViewed}
            />
          </Stack>
        </Stack>
      </SheetBody>
      <SheetFooter>
        <Inline gap={8} justify="between" align="center" style={{ width: "100%" }}>
          <SkillOptionsMenu
            skillName={skill.name}
            version={shownVersion}
            isOlder={isOlder}
            locked={hasChanges}
            canUpload={canEdit}
            canDelete={canDelete}
            onUpload={() => setUploading(true)}
            onDelete={() => setDeleting(true)}
          />
          {editable && (
            <SaveActions
              hasChanges={hasChanges}
              saving={saving}
              onDiscard={requestDiscardEdits}
              onSave={() => {
                if (!edit) return;
                setReviewChanges(getSkillFileChanges(edit.base, edit.draft));
                setReviewing(true);
              }}
            />
          )}
        </Inline>
      </SheetFooter>
      <SaveSkillVersionSheet
        open={reviewing}
        onOpenChange={setReviewing}
        skillName={skill.name}
        nextVersion={latestKnownVersion + 1}
        newerVersion={newerVersion}
        changes={reviewChanges}
        pending={saving}
        onSave={save}
      />
      {uploading && (
        <SkillUploadDialog
          projectId={projectId}
          skill={skill}
          onOpenChange={setUploading}
          onSaved={() => setViewed(null)}
        />
      )}
      <RollBackSkillDialog
        projectId={projectId}
        skill={skill}
        version={rollingBack}
        onClose={() => setRollingBack(undefined)}
        onRolledBack={() => setViewed(null)}
      />
      <DeleteSkillDialog
        projectId={projectId}
        skill={deleting ? skill : undefined}
        onOpenChange={setDeleting}
        onDeleted={onClose}
      />
      <DiscardChangesAlertDialog {...discardDialogProps} />
    </>
  );
};

const SkillSheetBody = ({ skillId, ...props }: TSkillSheetProps & { skillId: string }) => {
  const { data: skill, isPending } = useV4Adapter("agentVaultResources").useSkill(
    props.projectId,
    skillId
  );
  if (isPending) return <Loader size="page" label="Loading skill" />;
  if (!skill)
    return (
      <SheetBody>
        <EmptyState
          icon="file"
          title="Skill not found"
          description="This skill was deleted, or you don't have access to it."
        />
      </SheetBody>
    );
  return <SkillSheetEditor skill={skill} {...props} />;
};

export const SkillSheet = ({
  projectId,
  skillId,
  canEdit,
  canDelete,
  onOpenChange
}: {
  projectId: string;
  skillId?: string;
  canEdit: boolean;
  canDelete: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const [storedEdit, setEdit] = useState<TSkillEdit>();
  const [saving, setSaving] = useState(false);
  const edit = storedEdit?.skillId === skillId ? storedEdit : undefined;
  const hasChanges = edit ? getChangedSkillPaths(edit.base, edit.draft).hasChanges : false;
  const close = () => {
    setEdit(undefined);
    onOpenChange(false);
  };
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: hasChanges,
    onDiscard: close
  });

  return (
    <>
      <Sheet open={Boolean(skillId)} onOpenChange={(open) => !open && requestDiscard()}>
        <SheetContent size="lg" pending={saving}>
          {skillId && (
            <SkillSheetBody
              key={skillId}
              projectId={projectId}
              skillId={skillId}
              canEdit={canEdit}
              canDelete={canDelete}
              edit={edit}
              setEdit={setEdit}
              saving={saving}
              setSaving={setSaving}
              onClose={close}
            />
          )}
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog {...discardDialogProps} />
    </>
  );
};
