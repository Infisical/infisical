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
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Loader } from "@infisical/cipher/ui/loader";
import { Select } from "@infisical/cipher/ui/select";
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
import { Textarea } from "@infisical/cipher/ui/textarea";

import {
  formatSkillBytes,
  fromDraftFiles,
  getChangedSkillPaths,
  setSkillHeaderValue,
  SKILL_DESCRIPTION_MAX_LENGTH,
  SKILL_ENTRY_FILE,
  SKILL_NAME_MAX_LENGTH,
  SKILL_NAME_MESSAGE,
  SKILL_NAME_RE,
  toDraftFiles,
  toSkillFile,
  type TSkillDraftFile
} from "@app/helpers/agentVaultSkills";
import { SkillVersionConflictError } from "@app/hooks/api/agentVault/mutations";
import type { TAgentVaultSkillVersion } from "@app/hooks/api/agentVault/types";

import { failed, saved, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { DateCell } from "./shared";

const entryText = (name: string, description: string, instructions: string) =>
  setSkillHeaderValue(
    setSkillHeaderValue(`---\n---\n\n${instructions.trim()}\n`, "name", name),
    "description",
    description
  );

export const CreateSkillDialog = ({
  projectId,
  initialName = "",
  onCreated,
  onOpenChange
}: {
  projectId: string;
  initialName?: string;
  onCreated?: (skill: { id: string; name: string }) => void;
  onOpenChange: (open: boolean) => void;
}) => {
  const create = useV4Adapter("agentVaultResources").useCreateSkill(projectId);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [pending, setPending] = useState(false);
  const dirty = name !== initialName || Boolean(description || instructions);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: dirty,
    onDiscard: () => onOpenChange(false)
  });

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
              onSubmit={async (event) => {
                event.preventDefault();
                const next = {
                  name:
                    SKILL_NAME_RE.test(name) && name.length <= SKILL_NAME_MAX_LENGTH
                      ? undefined
                      : SKILL_NAME_MESSAGE,
                  description: description.trim()
                    ? undefined
                    : "Describe when an agent should use this skill.",
                  instructions: instructions.trim()
                    ? undefined
                    : `Write the instructions in ${SKILL_ENTRY_FILE}.`
                };
                setErrors(next);
                if (Object.values(next).some(Boolean)) return;
                setPending(true);
                try {
                  const { skill } = await create.mutateAsync({
                    files: [
                      toSkillFile(
                        SKILL_ENTRY_FILE,
                        entryText(name, description.trim(), instructions)
                      )
                    ]
                  });
                  saved(`Skill ${skill.name} created`);
                  onOpenChange(false);
                  onCreated?.(skill);
                } catch (error) {
                  failed("Failed to create skill", error);
                } finally {
                  setPending(false);
                }
              }}
            >
              <Stack gap={16}>
                <Field
                  label="Name"
                  description="Lower case letters, numbers and single hyphens."
                  error={errors.name}
                  wide
                >
                  <Input
                    value={name}
                    maxLength={SKILL_NAME_MAX_LENGTH}
                    placeholder="code-review"
                    invalid={Boolean(errors.name)}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
                <Field
                  label="Description"
                  description="Agents read this to decide when to use the skill."
                  error={errors.description}
                  wide
                >
                  <Textarea
                    rows={2}
                    maxLength={SKILL_DESCRIPTION_MAX_LENGTH}
                    value={description}
                    aria-invalid={Boolean(errors.description) || undefined}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </Field>
                <Field
                  label="Instructions"
                  description={`Saved as ${SKILL_ENTRY_FILE}. Markdown.`}
                  error={errors.instructions}
                  wide
                >
                  <Textarea
                    mono
                    rows={14}
                    value={instructions}
                    aria-invalid={Boolean(errors.instructions) || undefined}
                    onChange={(event) => setInstructions(event.target.value)}
                  />
                </Field>
              </Stack>
            </form>
          </SheetBody>
          <SheetFooter>
            <Inline gap={8} justify="end">
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
            </Inline>
          </SheetFooter>
        </SheetContent>
      </Sheet>
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

type TSkillEdit = {
  skillId: string;
  baseVersion: number;
  base: TSkillDraftFile[];
  draft: TSkillDraftFile[];
};

const SkillSheetBody = ({
  projectId,
  skillId,
  canEdit,
  canDelete,
  edit,
  setEdit,
  hasChanges,
  requestDiscard,
  onClose
}: {
  projectId: string;
  skillId: string;
  canEdit: boolean;
  canDelete: boolean;
  edit?: TSkillEdit;
  setEdit: Dispatch<SetStateAction<TSkillEdit | undefined>>;
  hasChanges: boolean;
  requestDiscard: () => void;
  onClose: () => void;
}) => {
  const resources = useV4Adapter("agentVaultResources");
  const { data: skill, isPending } = resources.useSkill(projectId, skillId);
  const { data: versions = [], isPending: isVersionsPending } = resources.useSkillVersions(
    projectId,
    skillId
  );
  const update = resources.useUpdateSkill(projectId);
  const restore = resources.useRestoreSkillVersion(projectId);
  const [viewed, setViewed] = useState<number | null>(null);
  const [path, setPath] = useState(SKILL_ENTRY_FILE);
  const [rollingBack, setRollingBack] = useState<number>();
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<number>();

  const latest = skill?.latestVersion;
  const isOlder = viewed !== null && viewed !== latest;
  const { data: olderVersion } = resources.useSkillVersion(
    projectId,
    skillId,
    isOlder ? viewed : undefined
  );
  const latestFiles = useMemo(() => toDraftFiles(skill?.files ?? []), [skill]);
  const shownFiles = useMemo(() => {
    if (isOlder) return toDraftFiles(olderVersion?.files ?? []);
    return edit ? edit.draft : latestFiles;
  }, [isOlder, olderVersion, edit, latestFiles]);
  const file = shownFiles.find((entry) => entry.path === path) ?? shownFiles[0];
  const isEditable = canEdit && !isOlder && file?.text !== null && file?.text !== undefined;

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

  const changeText = (text: string) => {
    if (!file) return;
    setEdit((prev) => {
      const current = prev ?? {
        skillId: skill.id,
        baseVersion: skill.latestVersion,
        base: latestFiles,
        draft: latestFiles
      };
      return {
        ...current,
        draft: current.draft.map((entry) => (entry.path === file.path ? { ...entry, text } : entry))
      };
    });
  };

  const versionColumns: DataTableColumn<TAgentVaultSkillVersion>[] = [
    {
      id: "version",
      header: "Version",
      width: 96,
      render: (version) => (
        <Button variant="link" underline="hover" onClick={() => setViewed(version.version)}>
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
    <>
      <SheetHeader>
        <SheetTitle>{skill.name}</SheetTitle>
        <SheetDescription>{skill.description}</SheetDescription>
      </SheetHeader>
      <SheetBody>
        <Stack gap={24}>
          {conflict !== undefined && (
            <Alert tone="warn">
              {`Version ${conflict} was published while you were editing. Saving again publishes your files over it.`}
            </Alert>
          )}
          {isOlder && (
            <Alert
              tone="info"
              actions={
                <Inline gap={8}>
                  {canEdit && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRollingBack(viewed ?? undefined)}
                    >
                      Roll back to this version
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setViewed(null)}>
                    View latest
                  </Button>
                </Inline>
              }
            >
              {`You are viewing v${viewed}. Agents get v${skill.latestVersion}.`}
            </Alert>
          )}
          <Stack gap={8}>
            <Inline gap={8} align="center" justify="between">
              <Heading level={3} size="subsection">
                Files
              </Heading>
              {shownFiles.length > 1 && (
                <Select
                  label="File"
                  size="sm"
                  value={file?.path}
                  options={shownFiles.map((entry) => ({
                    value: entry.path,
                    label: entry.path
                  }))}
                  onChange={setPath}
                />
              )}
            </Inline>
            {file && file.text !== null ? (
              <Textarea
                mono
                rows={18}
                aria-label={file.path}
                readOnly={!isEditable}
                value={file.text}
                onChange={(event) => changeText(event.target.value)}
              />
            ) : (
              <EmptyState
                size="sm"
                media="bare"
                icon="file"
                title={file ? `${file.path} is a binary file` : "No files"}
              />
            )}
          </Stack>
          <Stack gap={8}>
            <Heading level={3} size="subsection">
              Versions
            </Heading>
            <DataTable
              label={`Versions of ${skill.name}`}
              rows={versions}
              columns={versionColumns}
              getRowId={(version) => version.id}
              rowLabel={(version) => `v${version.version}`}
              loading={isVersionsPending}
              loadingRows={2}
              focusedRowId={
                versions.find((version) => version.version === (viewed ?? skill.latestVersion))?.id
              }
            />
          </Stack>
        </Stack>
      </SheetBody>
      <SheetFooter>
        <Inline gap={8} justify="between" style={{ width: "100%" }}>
          {canDelete ? (
            <Button variant="destructive" disabled={hasChanges} onClick={() => setDeleting(true)}>
              Delete skill
            </Button>
          ) : (
            <span />
          )}
          <Inline gap={8}>
            <Button variant="outline" disabled={saving} onClick={requestDiscard}>
              {hasChanges ? "Cancel" : "Close"}
            </Button>
            {canEdit && (
              <Button
                variant="primary"
                loading={saving}
                disabled={!hasChanges}
                onClick={async () => {
                  if (!edit) return;
                  setSaving(true);
                  try {
                    const { version, unchanged } = await update.mutateAsync({
                      skillId: skill.id,
                      files: fromDraftFiles(edit.draft),
                      ...(conflict === undefined && {
                        baseVersion: edit.baseVersion
                      })
                    });
                    if (unchanged)
                      toast({
                        tone: "neutral",
                        title: `No changes. Version ${version.version} already has these files.`
                      });
                    else saved(`Saved version ${version.version} of ${skill.name}`);
                    setConflict(undefined);
                    setEdit(undefined);
                  } catch (error) {
                    if (error instanceof SkillVersionConflictError)
                      setConflict(error.latestVersion);
                    failed("Failed to save skill", error);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                Save new version
              </Button>
            )}
          </Inline>
        </Inline>
      </SheetFooter>
      <AlertDialog
        open={rollingBack !== undefined}
        onOpenChange={(open) => !open && setRollingBack(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`Roll back to v${rollingBack ?? ""}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              Its files are published as a new version, and agents get them the next time they
              start.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (rollingBack === undefined) return;
                try {
                  const { version, unchanged } = await restore.mutateAsync({
                    skillId: skill.id,
                    version: rollingBack
                  });
                  if (unchanged)
                    toast({
                      tone: "neutral",
                      title: "This version already matches the latest."
                    });
                  else saved(`Rolled ${skill.name} back to v${rollingBack} as v${version.version}`);
                  setViewed(null);
                } catch (error) {
                  failed("Failed to roll back skill", error);
                }
                setRollingBack(undefined);
              }}
            >
              Roll back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <DeleteSkillDialog
        projectId={projectId}
        skill={deleting ? skill : undefined}
        onOpenChange={setDeleting}
        onDeleted={onClose}
      />
    </>
  );
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
        <SheetContent size="lg">
          {skillId && (
            <SkillSheetBody
              key={skillId}
              projectId={projectId}
              skillId={skillId}
              canEdit={canEdit}
              canDelete={canDelete}
              edit={edit}
              setEdit={setEdit}
              hasChanges={hasChanges}
              requestDiscard={requestDiscard}
              onClose={close}
            />
          )}
        </SheetContent>
      </Sheet>
      <DiscardChangesAlertDialog {...discardDialogProps} />
    </>
  );
};
