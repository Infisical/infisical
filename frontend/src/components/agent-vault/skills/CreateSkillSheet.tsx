import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { UploadIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DiscardChangesAlertDialog,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import {
  buildSkillMarkdown,
  fromDraftFiles,
  newDraftFile,
  parseSkillHeader,
  SKILL_DESCRIPTION_MAX_LENGTH,
  SKILL_ENTRY_FILE,
  SKILL_NAME_MAX_LENGTH,
  SKILL_NAME_MESSAGE,
  SKILL_NAME_RE,
  sortSkillFiles,
  splitFrontmatter,
  toDraftFiles,
  toSkillFile,
  TSkillDraftFile
} from "@app/helpers/agentVaultSkills";
import { useDiscardChangesGuard } from "@app/hooks";
import { useCreateAgentVaultSkill } from "@app/hooks/api/agentVault";
import { TAgentVaultSkill } from "@app/hooks/api/agentVault/types";

import { SkillFilesEditor } from "./SkillFilesEditor";
import { SkillUploadDialog, TSkillUpload } from "./SkillUploadDialog";

const schema = z.object({
  name: z
    .string()
    .min(1, "Required")
    .max(SKILL_NAME_MAX_LENGTH, `A name can be at most ${SKILL_NAME_MAX_LENGTH} characters.`)
    .regex(SKILL_NAME_RE, SKILL_NAME_MESSAGE),
  description: z
    .string()
    .trim()
    .min(1, "Required")
    .max(
      SKILL_DESCRIPTION_MAX_LENGTH,
      `A description can be at most ${SKILL_DESCRIPTION_MAX_LENGTH} characters.`
    )
});

type FormData = z.infer<typeof schema>;

const INITIAL_FILES = [newDraftFile(SKILL_ENTRY_FILE)];

const stripLeadingBlankLines = (text: string) => text.replace(/^(\r?\n)+/, "");

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  initialName?: string;
  description?: string;
  /** Awaited before the sheet closes, so the skill can't be created twice meanwhile. */
  onCreated?: (skill: TAgentVaultSkill) => void | Promise<void>;
  /** Whether the sheet confirms the new skill with a toast. Turn it off when the caller confirms it instead. */
  shouldNotify?: boolean;
};

export const CreateSkillSheet = ({
  isOpen,
  onOpenChange,
  initialName = "",
  description = `Write the instructions in ${SKILL_ENTRY_FILE} and add any files the skill needs, or upload a skill to start from.`,
  onCreated,
  shouldNotify = true
}: Props) => {
  const createSkill = useCreateAgentVaultSkill();
  const [files, setFiles] = useState<TSkillDraftFile[]>(INITIAL_FILES);
  const [selectedPath, setSelectedPath] = useState<string>(SKILL_ENTRY_FILE);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const {
    control,
    handleSubmit,
    getValues,
    setValue,
    reset,
    formState: { isDirty, isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: initialName, description: "" }
  });

  useEffect(() => {
    if (!isOpen) return;
    reset({ name: initialName, description: "" });
    setFiles(INITIAL_FILES);
    setSelectedPath(SKILL_ENTRY_FILE);
    setBodyError(null);
  }, [isOpen, initialName, reset]);

  const areFilesDirty = files !== INITIAL_FILES;
  const changedPaths = useMemo(
    () =>
      new Set(
        files
          .filter((file) => file.path !== SKILL_ENTRY_FILE || Boolean(file.text))
          .map((file) => file.path)
      ),
    [files]
  );

  const close = () => onOpenChange(false);

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty: isDirty || areFilesDirty, onDiscard: close });

  const applyHeader = (header: { name?: string; description?: string }) => {
    if (header.name !== undefined) {
      setValue("name", header.name, { shouldDirty: true, shouldValidate: true });
    }
    if (header.description !== undefined) {
      setValue("description", header.description, { shouldDirty: true, shouldValidate: true });
    }
  };

  // A header pasted into SKILL.md moves into the fields, unless it disagrees with what they already hold.
  const absorbPastedHeader = (text: string) => {
    if (!text.startsWith("---")) return null;
    const { frontmatter, body } = splitFrontmatter(text);
    if (frontmatter === null) return null;
    const header = parseSkillHeader(frontmatter);
    const current = getValues();
    const fits = (key: keyof FormData) =>
      header[key] === undefined || !current[key] || current[key] === header[key];
    if (!fits("name") || !fits("description")) return null;
    applyHeader(header);
    return stripLeadingBlankLines(body);
  };

  const handleFilesChange = (next: TSkillDraftFile[]) => {
    const before = files.find((file) => file.path === SKILL_ENTRY_FILE)?.text;
    const entry = next.find((file) => file.path === SKILL_ENTRY_FILE);
    const body = entry?.text && entry.text !== before ? absorbPastedHeader(entry.text) : null;
    setFiles(
      body === null
        ? next
        : next.map((file) => (file.path === SKILL_ENTRY_FILE ? { ...file, text: body } : file))
    );
    setBodyError(null);
  };

  const handleUpload = ({ files: uploaded, isEntryOnly }: TSkillUpload) => {
    const drafts = toDraftFiles(uploaded);
    const next = isEntryOnly
      ? [drafts[0], ...files.filter((file) => file.path !== SKILL_ENTRY_FILE)]
      : drafts;
    const entry = next.find((file) => file.path === SKILL_ENTRY_FILE);
    let entryText = "";
    if (entry?.text) {
      const { frontmatter, body } = splitFrontmatter(entry.text);
      if (frontmatter === null) {
        entryText = entry.text;
      } else {
        applyHeader(parseSkillHeader(frontmatter));
        entryText = stripLeadingBlankLines(body);
      }
    }
    setFiles(
      sortSkillFiles([
        newDraftFile(SKILL_ENTRY_FILE, entryText),
        ...next.filter((file) => file.path !== SKILL_ENTRY_FILE)
      ])
    );
    setSelectedPath(SKILL_ENTRY_FILE);
    setBodyError(null);
  };

  const onSubmit = async (data: FormData) => {
    const entry = files.find((file) => file.path === SKILL_ENTRY_FILE);
    const rest = files.filter((file) => file.path !== SKILL_ENTRY_FILE);
    if (!entry?.text?.trim()) {
      setSelectedPath(SKILL_ENTRY_FILE);
      setBodyError(`Write the instructions in ${SKILL_ENTRY_FILE}.`);
      return;
    }
    if (splitFrontmatter(entry.text).frontmatter !== null) {
      setSelectedPath(SKILL_ENTRY_FILE);
      setBodyError(
        `Remove the YAML header from ${SKILL_ENTRY_FILE}. The Name and Description fields fill it in.`
      );
      return;
    }

    let skill: TAgentVaultSkill;
    try {
      ({ skill } = await createSkill.mutateAsync({
        files: [
          toSkillFile(SKILL_ENTRY_FILE, buildSkillMarkdown({ ...data, body: entry.text })),
          ...fromDraftFiles(rest)
        ],
        source: "form"
      }));
    } catch {
      return;
    }
    if (shouldNotify)
      createNotification({ text: `Skill "${skill.name}" created`, type: "success" });
    await onCreated?.(skill);
    close();
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && requestDiscard()}>
        <SheetContent
          size="wide"
          className="flex h-full max-h-full w-full flex-col gap-y-0"
          isPending={isSubmitting}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <SheetHeader className="pr-12">
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <SheetTitle>Create Skill</SheetTitle>
                  <SheetDescription>{description}</SheetDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  isDisabled={isSubmitting}
                  onClick={() => setIsUploadOpen(true)}
                >
                  <UploadIcon />
                  Upload
                </Button>
              </div>
            </SheetHeader>

            <div className="flex min-h-0 thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto p-4">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
                <Controller
                  control={control}
                  name="name"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel>Name</FieldLabel>
                      <FieldContent>
                        <Input
                          {...field}
                          placeholder="code-review"
                          autoComplete="off"
                          spellCheck={false}
                          isError={Boolean(fieldState.error)}
                        />
                        <FieldDescription>It can&apos;t be changed later.</FieldDescription>
                        <FieldError>{fieldState.error?.message}</FieldError>
                      </FieldContent>
                    </Field>
                  )}
                />
                <Controller
                  control={control}
                  name="description"
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel>Description</FieldLabel>
                      <FieldContent>
                        <Input
                          {...field}
                          placeholder="Reviews a pull request against the team's checklist. Use when asked to review code."
                          isError={Boolean(fieldState.error)}
                        />
                        <FieldDescription>
                          Agents read this to decide when to use the skill.
                        </FieldDescription>
                        <FieldError>{fieldState.error?.message}</FieldError>
                      </FieldContent>
                    </Field>
                  )}
                />
              </div>

              <Field>
                <FieldLabel>Files</FieldLabel>
                <FieldContent>
                  <SkillFilesEditor
                    files={files}
                    selectedPath={selectedPath}
                    onSelect={setSelectedPath}
                    isEditing
                    defaultView="code"
                    onChange={handleFilesChange}
                    changedPaths={changedPaths}
                    requiredPaths={[SKILL_ENTRY_FILE]}
                    getPlaceholder={(path) =>
                      path === SKILL_ENTRY_FILE
                        ? "Read the diff, check it against the team's checklist, and list what needs fixing."
                        : undefined
                    }
                    className="h-[calc(100dvh-14rem)] min-h-96"
                  />
                  <FieldError>{bodyError}</FieldError>
                </FieldContent>
              </Field>
            </div>

            <SheetFooter className="justify-end border-t">
              <Button
                type="button"
                variant="ghost"
                onClick={requestDiscard}
                isDisabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" variant="av" isPending={isSubmitting}>
                Create Skill
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <SkillUploadDialog
        isOpen={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        onLoad={handleUpload}
      />

      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Skill?"
        description="The skill you are writing will be lost."
      />
    </>
  );
};
