import { FormEvent, useEffect, useMemo, useState } from "react";
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
  fromDraftFiles,
  getReservedSkillNameMessage,
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
  TSkillDraftFile
} from "@app/helpers/agentVaultSkills";
import { useDiscardChangesGuard } from "@app/hooks";
import { useCreateAgentVaultSkill } from "@app/hooks/api/agentVault";
import { TAgentVaultSkillSummary } from "@app/hooks/api/agentVault/types";

import { handleSkillEditorEscape, SkillFilesEditor } from "./SkillFilesEditor";
import { SkillUploadDialog, TSkillUpload } from "./SkillUploadDialog";

const schema = z.object({
  name: z
    .string()
    .min(1, "Required")
    .max(SKILL_NAME_MAX_LENGTH, `A name can be at most ${SKILL_NAME_MAX_LENGTH} characters.`)
    .regex(SKILL_NAME_RE, SKILL_NAME_MESSAGE)
    .refine(
      (name) => !isReservedSkillName(name),
      (name) => ({ message: getReservedSkillNameMessage(name) })
    ),
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

const HEADER_KEYS = ["name", "description"] as const;

const withHeader = (text: string, values: FormData) =>
  HEADER_KEYS.reduce((next, key) => setSkillHeaderValue(next, key, values[key]), text);

// The fields are single-line inputs, which drop line breaks, so a description written over several lines shows its
// line breaks as spaces.
const toFieldText = (value: unknown) =>
  getSkillHeaderText(value)
    .replace(/\n+$/, "")
    .replace(/[ \t]*\n[ \t]*/g, " ");

/** The header's name and description, or null when the text has no header or it can't be read. */
const readHeaderFields = (text: string): FormData | null => {
  const { frontmatter } = splitFrontmatter(text);
  const header = frontmatter === null ? null : parseSkillHeader(frontmatter);
  if (!header) return null;
  return {
    name: getSkillHeaderText(header.name),
    description: toFieldText(header.description)
  };
};

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  initialName?: string;
  description?: string;
  /** Awaited before the sheet closes, so the skill can't be created twice meanwhile. */
  onCreated?: (skill: TAgentVaultSkillSummary) => void | Promise<void>;
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
  const initialFiles = useMemo(
    () => [newDraftFile(SKILL_ENTRY_FILE, withHeader("", { name: initialName, description: "" }))],
    [initialName]
  );
  const [files, setFiles] = useState<TSkillDraftFile[]>(initialFiles);
  const [selectedPath, setSelectedPath] = useState<string>(SKILL_ENTRY_FILE);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);

  const {
    control,
    handleSubmit,
    getValues,
    setValue,
    reset,
    formState: { isDirty, isSubmitting, isSubmitted }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: initialName, description: "" }
  });

  useEffect(() => {
    if (!isOpen) return;
    reset({ name: initialName, description: "" });
    setFiles(initialFiles);
    setSelectedPath(SKILL_ENTRY_FILE);
    setBodyError(null);
  }, [isOpen, initialName, initialFiles, reset]);

  const areFilesDirty = files !== initialFiles;
  const changedPaths = useMemo(
    () =>
      new Set(
        files
          .filter((file) => file.path !== SKILL_ENTRY_FILE || file.text !== initialFiles[0].text)
          .map((file) => file.path)
      ),
    [files, initialFiles]
  );

  const close = () => onOpenChange(false);

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty: isDirty || areFilesDirty, onDiscard: close });

  const getEntryText = (from = files) =>
    from.find((file) => file.path === SKILL_ENTRY_FILE)?.text ?? "";

  const entryHeader = splitFrontmatter(getEntryText()).frontmatter;
  const headerError = useMemo(
    () => (entryHeader === null ? null : getSkillHeaderError(entryHeader)),
    [entryHeader]
  );

  const setEntryText = (from: TSkillDraftFile[], text: string) =>
    from.map((file) => (file.path === SKILL_ENTRY_FILE ? { ...file, text } : file));

  const syncFieldsFromHeader = (text: string) => {
    const fields = readHeaderFields(text);
    if (!fields) return;
    const current = getValues();
    HEADER_KEYS.forEach((key) => {
      if (fields[key] !== current[key])
        setValue(key, fields[key], { shouldDirty: true, shouldValidate: isSubmitted });
    });
  };

  const handleFieldChange = (key: (typeof HEADER_KEYS)[number], value: string) => {
    // While the header was broken the other field couldn't follow it, so it catches up once this edit repairs it.
    if (headerError) syncFieldsFromHeader(setSkillHeaderValue(getEntryText(), key, value));
    setFiles((prev) => setEntryText(prev, setSkillHeaderValue(getEntryText(prev), key, value)));
    setBodyError(null);
  };

  const handleFilesChange = (next: TSkillDraftFile[]) => {
    const text = getEntryText(next);
    if (text !== getEntryText()) syncFieldsFromHeader(text);
    setFiles(next);
    setBodyError(null);
  };

  const handleUpload = ({ files: uploaded, isEntryOnly }: TSkillUpload) => {
    const drafts = toDraftFiles(uploaded);
    const next = isEntryOnly
      ? [drafts[0], ...files.filter((file) => file.path !== SKILL_ENTRY_FILE)]
      : drafts;
    const entry = next.find((file) => file.path === SKILL_ENTRY_FILE);
    let entryFiles: TSkillDraftFile[];
    if (entry?.text && splitFrontmatter(entry.text).frontmatter !== null) {
      syncFieldsFromHeader(entry.text);
      entryFiles = next;
    } else if (entry && entry.text !== null) {
      entryFiles = setEntryText(next, withHeader(entry.text, getValues()));
    } else {
      entryFiles = [
        newDraftFile(SKILL_ENTRY_FILE, withHeader("", getValues())),
        ...next.filter((file) => file.path !== SKILL_ENTRY_FILE)
      ];
    }
    setFiles(sortSkillFiles(entryFiles));
    setSelectedPath(SKILL_ENTRY_FILE);
    setBodyError(null);
    setUploadCount((count) => count + 1);
  };

  const onSubmit = async () => {
    const text = getEntryText();
    const { frontmatter, body } = splitFrontmatter(text);
    const header = frontmatter === null ? {} : parseSkillHeader(frontmatter);
    if (!header) return;
    if (!body.trim()) {
      setSelectedPath(SKILL_ENTRY_FILE);
      setBodyError(`Write the instructions in ${SKILL_ENTRY_FILE}.`);
      return;
    }

    // Only where the header disagrees with the fields (no header, or a name written as `12`), so a header that
    // already matches, such as a folded description, keeps its exact text.
    const values = getValues();
    const entryText = HEADER_KEYS.reduce(
      (next, key) =>
        header[key] === values[key] ||
        (key === "description" &&
          typeof header[key] === "string" &&
          toFieldText(header[key]) === values[key])
          ? next
          : setSkillHeaderValue(next, key, values[key]),
      text
    );

    let skill: TAgentVaultSkillSummary;
    try {
      ({ skill } = await createSkill.mutateAsync({
        files: fromDraftFiles(setEntryText(files, entryText))
      }));
    } catch {
      return;
    }
    if (shouldNotify)
      createNotification({ text: `Skill "${skill.name}" created`, type: "success" });
    await onCreated?.(skill);
    close();
  };

  // A broken header is reported before the fields' checks, since the fields can't show what it holds.
  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    if (headerError) {
      event.preventDefault();
      setSelectedPath(SKILL_ENTRY_FILE);
      return;
    }
    handleSubmit(onSubmit)(event);
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={(open) => !open && requestDiscard()}>
        <SheetContent
          size="wide"
          className="flex h-full max-h-full w-full flex-col gap-y-0"
          isPending={isSubmitting}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={handleSkillEditorEscape}
        >
          <form onSubmit={handleCreate} className="flex min-h-0 flex-1 flex-col">
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
                          onChange={(event) => {
                            field.onChange(event);
                            handleFieldChange("name", event.target.value);
                          }}
                          placeholder="code-review"
                          autoComplete="off"
                          spellCheck={false}
                          isError={Boolean(fieldState.error)}
                        />
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
                          onChange={(event) => {
                            field.onChange(event);
                            handleFieldChange("description", event.target.value);
                          }}
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
                  <FieldError>{headerError ?? bodyError}</FieldError>
                  <SkillFilesEditor
                    files={files}
                    selectedPath={selectedPath}
                    onSelect={setSelectedPath}
                    isEditing
                    defaultView="code"
                    onChange={handleFilesChange}
                    changedPaths={changedPaths}
                    requiredPaths={[SKILL_ENTRY_FILE]}
                    historyKey={uploadCount}
                    className="h-[calc(100dvh-14rem)] min-h-96"
                  />
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
