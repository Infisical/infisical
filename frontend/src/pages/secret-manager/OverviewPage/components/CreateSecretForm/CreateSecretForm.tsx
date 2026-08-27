import { ClipboardEvent, KeyboardEvent, useMemo, useRef } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangleIcon,
  InfoIcon,
  PlusIcon,
  TrashIcon,
  TriangleAlertIcon,
  UploadIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { parsePastedEnv } from "@app/components/utilities/parseSecrets";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  Combobox,
  IconButton,
  InfisicalSecretInput,
  Input,
  PasswordGenerator,
  SheetFooter,
  Switch,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel
} from "@app/components/v3/generic/Field";
import { CreatableSelect } from "@app/components/v3/generic/ReactSelect";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { getKeyValue } from "@app/helpers/parseEnvVar";
import {
  useCreateSecretV3,
  useCreateWsTag,
  useGetOrCreateFolder,
  useGetWsTags
} from "@app/hooks/api";
import { SecretType } from "@app/hooks/api/types";
import { slugSchema } from "@app/lib/schemas";

const formSchema = (enforceEncryptedMetadata: boolean) =>
  z
    .object({
      environments: z
        .object({ name: z.string(), slug: z.string() })
        .array()
        .min(1, { message: "Required" }),
      secrets: z
        .array(
          z.object({
            key: z.string().trim().min(1, "Key is required"),
            value: z.string().optional(),
            comment: z.string().optional(),
            skipMultilineEncoding: z.boolean().optional(),
            tags: z
              .array(z.object({ label: z.string().trim(), value: z.string().trim() }))
              .optional(),
            metadata: z
              .array(
                z.object({
                  id: z.string(),
                  key: z.string().min(1, "Key is required"),
                  value: z.string(),
                  isEncrypted: enforceEncryptedMetadata
                    ? z.literal(true)
                    : z.boolean().default(false)
                })
              )
              .optional()
          })
        )
        .min(1)
    })
    .superRefine(({ secrets }, context) => {
      const seenKeys = new Set<string>();
      secrets.forEach((secret, index) => {
        const normalizedKey = secret.key.trim();
        if (seenKeys.has(normalizedKey)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Key must be unique",
            path: ["secrets", index, "key"]
          });
        }
        seenKeys.add(normalizedKey);
      });
    });

type TFormSchema = z.infer<ReturnType<typeof formSchema>>;

type TParsedEnv = Record<string, { value: string; comments: string[] }>;

type Props = {
  secretPath?: string;
  defaultSelectedEnvs?: { name: string; slug: string }[];
  onClose: () => void;
  isBatchMode?: boolean;
  onBatchSecretCreate?: (params: {
    env: string;
    key: string;
    value: string;
    comment?: string;
    skipMultilineEncoding?: boolean;
    tags?: { id: string; slug: string }[];
    metadata?: { key: string; value: string; isEncrypted?: boolean }[];
  }) => void;
  // Called after the user actually creates a secret (non-batch path) so the parent can run the
  // activation nudge. The parent owns the nudge hook + modal state, so this stays a callback.
  onSecretCreated?: () => void;
  // Called when the user opts to bulk-upload secrets instead. The parent owns the import modal,
  // so it swaps popups; when the user pasted multiple KEY=VALUE pairs, the parsed set is passed
  // along so the modal can skip its upload step.
  onUploadSecrets?: (env?: TParsedEnv) => void;
};

export const CreateSecretForm = ({
  secretPath = "/",
  defaultSelectedEnvs,
  onClose,
  isBatchMode,
  onBatchSecretCreate,
  onSecretCreated,
  onUploadSecrets
}: Props) => {
  const { currentProject, projectId } = useProject();
  const { permission } = useProjectPermission();
  const canReadTags = permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);
  const canCreateTags = permission.can(ProjectPermissionActions.Create, ProjectPermissionSub.Tags);
  const environments = currentProject?.environments || [];

  const defaultEnvs = useMemo(() => {
    if (defaultSelectedEnvs && defaultSelectedEnvs.length > 0) return defaultSelectedEnvs;
    // if all envs are selected on the dashboard the array is empty so we need to resolve here
    return environments.filter((env) =>
      permission.can(
        ProjectPermissionSecretActions.Create,
        subject(ProjectPermissionSub.Secrets, {
          environment: env.slug,
          secretPath,
          secretName: "*",
          secretTags: ["*"]
        })
      )
    );
  }, [defaultSelectedEnvs, environments, permission, secretPath]);

  const {
    handleSubmit,
    control,
    reset,
    setValue,
    getValues,
    watch,
    formState: { isSubmitting, errors }
  } = useForm<TFormSchema>({
    resolver: zodResolver(
      formSchema(Boolean(currentProject?.enforceEncryptedSecretManagerSecretMetadata))
    ),
    defaultValues: {
      environments: defaultEnvs,
      secrets: [{ key: "", value: "", skipMultilineEncoding: false, metadata: [], tags: [] }]
    }
  });

  const {
    fields: secretFields,
    append: appendSecret,
    remove: removeSecret
  } = useFieldArray({ control, name: "secrets" });

  const { mutateAsync: createSecretV3 } = useCreateSecretV3();
  const { mutateAsync: getOrCreateFolder } = useGetOrCreateFolder();
  const { data: projectTags, isPending: isTagsLoading } = useGetWsTags(
    canReadTags ? projectId : ""
  );

  const tagOptions = useMemo(
    () => projectTags?.map((el) => ({ label: el.slug, value: el.id })),
    [projectTags]
  );

  const secretKeyInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const selectedEnvironments = watch("environments");

  const handleFormSubmit = async ({ environments: selectedEnv, secrets }: TFormSchema) => {
    if (isBatchMode && onBatchSecretCreate) {
      secrets.forEach((secret) => {
        const filteredMetadata = secret.metadata
          ?.filter((metadata) => metadata.key && metadata.value)
          .map(({ key, value, isEncrypted }) => ({ key, value, isEncrypted }));
        selectedEnv.forEach((env) => {
          onBatchSecretCreate({
            env: env.slug,
            key: secret.key,
            value: secret.value || "",
            comment: secret.comment || undefined,
            skipMultilineEncoding: secret.skipMultilineEncoding || undefined,
            tags: secret.tags?.map((tag) => ({ id: tag.value, slug: tag.label })),
            metadata: filteredMetadata?.length ? filteredMetadata : undefined
          });
        });
      });
      onClose();
      reset();
      return;
    }

    await Promise.all(
      selectedEnv.map(async (env) => {
        if (secretPath !== "/") {
          const pathSegment = secretPath.split("/").filter(Boolean);
          const parentPath = `/${pathSegment.slice(0, -1).join("/")}`;
          const folderName = pathSegment.at(-1);
          const canCreateFolder = permission.can(
            ProjectPermissionActions.Create,
            subject(ProjectPermissionSub.SecretFolders, {
              environment: env.slug,
              secretPath: parentPath
            })
          );

          if (folderName && parentPath && canCreateFolder) {
            await getOrCreateFolder({
              projectId,
              path: parentPath,
              environment: env.slug,
              name: folderName
            });
          }
        }
      })
    );

    const promises = selectedEnv.flatMap((env) =>
      secrets.map(async (secret) => {
        const environment = env.slug;
        const filteredMetadata = secret.metadata
          ?.filter((metadata) => metadata.key && metadata.value)
          .map(({ key, value, isEncrypted }) => ({ key, value, isEncrypted }));
        return {
          ...(await createSecretV3({
            environment,
            projectId,
            secretPath,
            secretKey: secret.key,
            secretValue: secret.value || "",
            secretComment: secret.comment || "",
            skipMultilineEncoding: secret.skipMultilineEncoding || undefined,
            type: SecretType.Shared,
            tagIds: secret.tags?.map((tag) => tag.value),
            secretMetadata: filteredMetadata?.length ? filteredMetadata : undefined
          })),
          environment
        };
      })
    );

    const results = await Promise.allSettled(promises);
    const forApprovalEnvs = [
      ...new Set(
        results
          .map((result) =>
            result.status === "fulfilled" && "approval" in result.value
              ? result.value.environment
              : undefined
          )
          .filter(Boolean) as string[]
      )
    ];

    const updatedEnvs = [
      ...new Set(
        results
          .map((result) =>
            result.status === "fulfilled" && !("approval" in result.value)
              ? result.value.environment
              : undefined
          )
          .filter(Boolean) as string[]
      )
    ];

    if (forApprovalEnvs.length) {
      createNotification({
        type: "info",
        text: `Change request submitted for ${
          forApprovalEnvs.length > 1 ? "environments" : "environment"
        }: ${forApprovalEnvs.join(", ")}`
      });
    }

    if (updatedEnvs.length) {
      createNotification({
        type: "success",
        text: `Secrets created in ${
          updatedEnvs.length > 1 ? "environments" : "environment"
        }: ${updatedEnvs.join(", ")}`
      });

      // The user just created a secret: let the parent check whether to surface the nudge.
      onSecretCreated?.();
    }

    if (!updatedEnvs.length && !forApprovalEnvs.length) {
      // this should only occur when a toast notifcation is created from failed mutation
      console.warn("failed to create secrets");
    } else {
      onClose();
      reset();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>, index: number) => {
    const delimitters = [":", "="];
    const pastedContent = e.clipboardData.getData("text");
    const { key, value } = getKeyValue(pastedContent, delimitters);

    const isWholeKeyHighlighted =
      e.currentTarget.selectionStart === 0 &&
      e.currentTarget.selectionEnd === e.currentTarget.value.length;

    if (!getValues(`secrets.${index}.key`) || isWholeKeyHighlighted) {
      e.preventDefault();

      const parsedEnv = parsePastedEnv(pastedContent);
      const parsedEntries = Object.entries(parsedEnv);
      if (parsedEntries.length > 1) {
        const toSecret = ([parsedKey, parsedValue]: (typeof parsedEntries)[number]) => ({
          key: currentProject.autoCapitalization ? parsedKey.toUpperCase() : parsedKey,
          value: parsedValue.value,
          comment: parsedValue.comments.join("\n"),
          skipMultilineEncoding: false,
          tags: [],
          metadata: []
        });
        setValue(`secrets.${index}`, toSecret(parsedEntries[0]));
        parsedEntries.slice(1).forEach((entry) => appendSecret(toSecret(entry)));
        return;
      }

      const keyStr = currentProject.autoCapitalization ? key.toUpperCase() : key;
      setValue(`secrets.${index}.key`, keyStr);
      if (value) {
        setValue(`secrets.${index}.value`, value);
      }
    }
  };

  const createWsTag = useCreateWsTag();

  const createNewTag = async (slug: string, index: number) => {
    if (!canCreateTags) return;
    const parsedSlug = slugSchema().safeParse(slug);
    if (!parsedSlug.success) return;
    const newTag = await createWsTag.mutateAsync({
      projectId,
      tagSlug: parsedSlug.data,
      tagColor: ""
    });
    const currentTags = getValues(`secrets.${index}.tags`) ?? [];
    setValue(`secrets.${index}.tags`, [...currentTags, { label: newTag.slug, value: newTag.id }], {
      shouldDirty: true
    });
  };

  const submitForm = handleSubmit(handleFormSubmit);

  const handleFormKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    // Allow Cmd+Enter (macOS) / Ctrl+Enter (other OSes) to submit the form.
    // react-hook-form's handleSubmit wrapper still runs validation, so this
    // does not bypass the required key/value checks.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !isSubmitting) {
      e.preventDefault();
      submitForm();
    }
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <form
      onSubmit={submitForm}
      onKeyDown={handleFormKeyDown}
      noValidate
      className="flex flex-1 flex-col gap-4 overflow-hidden"
    >
      <div className="flex thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto p-4">
        <Controller
          control={control}
          name="environments"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel htmlFor="create-secret-environments">Environments</FieldLabel>
              <FieldContent>
                <Combobox
                  id="create-secret-environments"
                  multiple
                  options={environments.filter((environment) =>
                    permission.can(
                      ProjectPermissionSecretActions.Create,
                      subject(ProjectPermissionSub.Secrets, {
                        environment: environment.slug,
                        secretPath,
                        secretName: "*",
                        secretTags: ["*"]
                      })
                    )
                  )}
                  value={value}
                  onValueChange={onChange}
                  isError={Boolean(error)}
                  modal
                  placeholder="Select environments to create secret in..."
                  searchPlaceholder="Search environments..."
                  searchAriaLabel="Search environments"
                  emptyMessage="No environments found."
                  getOptionLabel={(option) => option.name}
                  getOptionValue={(option) => option.slug}
                />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />

        {secretFields.map((secretField, index) => {
          const secretKey = watch(`secrets.${index}.key`);
          const metadata = watch(`secrets.${index}.metadata`) ?? [];

          return (
            <div
              key={secretField.id}
              className={twMerge(
                "relative flex flex-col gap-4 rounded-md border border-transparent bg-transparent p-0 transition-[padding,background-color,border-color] duration-200 ease-out motion-reduce:transition-none",
                secretFields.length > 1 && "border-border bg-container/50 p-4"
              )}
            >
              <div className="flex items-start gap-2">
                <Controller
                  control={control}
                  name={`secrets.${index}.key`}
                  render={({ field, fieldState: { error } }) => (
                    <Field className="flex-1">
                      <FieldLabel htmlFor={`create-secret-${index}-key`}>Key</FieldLabel>
                      <FieldContent>
                        <div className="relative">
                          <Input
                            ref={(element) => {
                              secretKeyInputRefs.current[index] = element;
                            }}
                            id={`create-secret-${index}-key`}
                            value={field.value ?? ""}
                            onChange={(e) => {
                              const val = currentProject?.autoCapitalization
                                ? e.target.value.toUpperCase()
                                : e.target.value;
                              field.onChange(val);
                            }}
                            onBlur={field.onBlur}
                            placeholder="Type your secret name"
                            onPaste={(event) => handlePaste(event, index)}
                            autoFocus={index === 0}
                            autoComplete="off"
                            isError={Boolean(error)}
                            className={currentProject?.autoCapitalization ? "uppercase" : undefined}
                          />
                          {secretKey?.trim().includes(" ") && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <AlertTriangleIcon className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-warning" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-72">
                                Secret key contains whitespaces. If this is the desired format, you
                                need to provide it as{" "}
                                <code className="rounded-md bg-container px-1 py-0.5">
                                  {encodeURIComponent(secretKey.trim())}
                                </code>{" "}
                                when making API requests.
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <FieldError errors={[error]} />
                      </FieldContent>
                    </Field>
                  )}
                />
                {secretFields.length > 1 && (
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="mt-6.5"
                    aria-label={`Remove secret ${index + 1}`}
                    onClick={() => removeSecret(index)}
                  >
                    <TrashIcon className="size-4" />
                  </IconButton>
                )}
              </div>

              <Controller
                control={control}
                name={`secrets.${index}.value`}
                render={({ field }) => (
                  <Field>
                    <div className="flex items-center justify-between gap-2">
                      <FieldLabel htmlFor={`create-secret-${index}-value`}>
                        Value
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <InfoIcon />
                          </TooltipTrigger>
                          <TooltipContent>
                            You can add references to other secrets using the format{" "}
                            <code className="rounded-sm bg-accent px-1 py-0.5 text-background">
                              &#36;{"{"}secret_name{"}"}
                            </code>
                          </TooltipContent>
                        </Tooltip>
                      </FieldLabel>
                      <PasswordGenerator
                        trigger={
                          <Button variant="link" size="xs">
                            Generate
                          </Button>
                        }
                        selectedEnvironments={selectedEnvironments}
                        onUsePassword={field.onChange}
                        projectId={projectId}
                        secretPath={secretPath}
                        environments={environments}
                      />
                    </div>
                    <FieldContent>
                      <InfisicalSecretInput
                        id={`create-secret-${index}-value`}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder="Enter secret value..."
                      />
                      <FieldError errors={[errors.secrets?.[index]?.value]} />
                    </FieldContent>
                  </Field>
                )}
              />

              <Accordion type="single" collapsible variant="ghost">
                <AccordionItem value="advanced" className="border-b-0">
                  <AccordionTrigger>Advanced Options</AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col gap-4">
                      <Controller
                        control={control}
                        name={`secrets.${index}.comment`}
                        render={({ field }) => (
                          <Field>
                            <FieldLabel htmlFor={`create-secret-${index}-comment`}>
                              Comment
                            </FieldLabel>
                            <FieldContent>
                              <TextArea
                                {...field}
                                id={`create-secret-${index}-comment`}
                                placeholder="Add a comment for this secret..."
                                className="max-h-32 min-h-[60px] resize-y"
                              />
                            </FieldContent>
                          </Field>
                        )}
                      />

                      <Controller
                        control={control}
                        name={`secrets.${index}.tags`}
                        render={({ field }) => (
                          <Field>
                            <FieldLabel htmlFor={`create-secret-${index}-tags`}>Tags</FieldLabel>
                            <FieldContent>
                              {!canReadTags ? (
                                <FieldDescription>
                                  <span className="flex items-center gap-1.5 text-warning">
                                    <TriangleAlertIcon className="size-3" />
                                    You do not have permission to read tags.
                                  </span>
                                </FieldDescription>
                              ) : (
                                <CreatableSelect
                                  isMulti
                                  className="w-full"
                                  inputId={`create-secret-${index}-tags`}
                                  placeholder="Select tags to assign to secret..."
                                  isValidNewOption={(v) =>
                                    canCreateTags && slugSchema().safeParse(v).success
                                  }
                                  name="tagIds"
                                  isDisabled={!canReadTags}
                                  isLoading={isTagsLoading && canReadTags}
                                  options={tagOptions}
                                  value={field.value}
                                  onChange={field.onChange}
                                  onCreateOption={
                                    canCreateTags ? (slug) => createNewTag(slug, index) : undefined
                                  }
                                />
                              )}
                            </FieldContent>
                          </Field>
                        )}
                      />

                      <Controller
                        control={control}
                        name={`secrets.${index}.skipMultilineEncoding`}
                        render={({ field }) => (
                          <Field orientation="horizontal">
                            <FieldLabel
                              htmlFor={`create-secret-${index}-multiline-encoding`}
                              className="cursor-pointer"
                            >
                              Enable Multiline Encoding
                            </FieldLabel>
                            <Switch
                              id={`create-secret-${index}-multiline-encoding`}
                              variant="project"
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </Field>
                        )}
                      />

                      <div>
                        <div className="mb-1">
                          <p className="text-sm font-medium">Metadata</p>
                          <p className="mt-1 text-xs text-accent">
                            Encrypted Metadata will not be searchable via the UI or API.
                          </p>
                        </div>
                        <div className="flex max-h-64 thin-scrollbar flex-col gap-3 overflow-y-auto rounded-md border border-border bg-container/50 p-4">
                          {metadata.length === 0 && (
                            <p className="text-center text-sm text-muted">
                              No metadata entries. Click below to add.
                            </p>
                          )}
                          {metadata.map((metadataEntry, metadataIndex) => (
                            <div key={metadataEntry.id} className="flex items-start gap-3">
                              <Field className="flex-1">
                                <FieldLabel
                                  htmlFor={`create-secret-${index}-metadata-${metadataIndex}-key`}
                                  className={metadataIndex === 0 ? "text-xs" : "sr-only"}
                                >
                                  Key
                                </FieldLabel>
                                <FieldContent>
                                  <Controller
                                    control={control}
                                    name={`secrets.${index}.metadata.${metadataIndex}.key`}
                                    render={({ field: inputField, fieldState: { error } }) => (
                                      <>
                                        <Input
                                          {...inputField}
                                          id={`create-secret-${index}-metadata-${metadataIndex}-key`}
                                          placeholder="Enter key"
                                          className="h-8"
                                        />
                                        <FieldError errors={[error]} />
                                      </>
                                    )}
                                  />
                                </FieldContent>
                              </Field>

                              <Field className="flex-1">
                                <FieldLabel
                                  htmlFor={`create-secret-${index}-metadata-${metadataIndex}-value`}
                                  className={metadataIndex === 0 ? "text-xs" : "sr-only"}
                                >
                                  Value
                                </FieldLabel>
                                <FieldContent>
                                  <Controller
                                    control={control}
                                    name={`secrets.${index}.metadata.${metadataIndex}.value`}
                                    render={({ field: inputField, fieldState: { error } }) => (
                                      <>
                                        <Input
                                          {...inputField}
                                          id={`create-secret-${index}-metadata-${metadataIndex}-value`}
                                          placeholder="Enter value"
                                          className="h-8"
                                        />
                                        <FieldError errors={[error]} />
                                      </>
                                    )}
                                  />
                                </FieldContent>
                              </Field>

                              <Field className="w-10">
                                <FieldLabel
                                  htmlFor={`create-secret-${index}-metadata-${metadataIndex}-encrypted`}
                                  className={metadataIndex === 0 ? "text-xs" : "sr-only"}
                                >
                                  Encrypt
                                </FieldLabel>
                                <Controller
                                  control={control}
                                  name={`secrets.${index}.metadata.${metadataIndex}.isEncrypted`}
                                  render={({ field: switchField }) => (
                                    <>
                                      <Switch
                                        id={`create-secret-${index}-metadata-${metadataIndex}-encrypted`}
                                        className="mt-2"
                                        variant="project"
                                        size="default"
                                        checked={switchField.value}
                                        disabled={Boolean(
                                          currentProject?.enforceEncryptedSecretManagerSecretMetadata
                                        )}
                                        onCheckedChange={switchField.onChange}
                                      />
                                      <FieldError
                                        errors={[
                                          errors.secrets?.[index]?.metadata?.[metadataIndex]
                                            ?.isEncrypted
                                        ]}
                                      />
                                    </>
                                  )}
                                />
                              </Field>

                              <IconButton
                                variant="ghost"
                                size="xs"
                                type="button"
                                aria-label={`Remove metadata entry ${metadataIndex + 1}`}
                                className={twMerge(
                                  metadataIndex === 0 ? "mt-6.5" : "mt-0.5",
                                  "transition-transform hover:text-danger"
                                )}
                                onClick={() =>
                                  setValue(
                                    `secrets.${index}.metadata`,
                                    metadata.filter(
                                      (__, currentIndex) => currentIndex !== metadataIndex
                                    ),
                                    { shouldDirty: true }
                                  )
                                }
                              >
                                <TrashIcon className="size-4" />
                              </IconButton>
                            </div>
                          ))}
                        </div>

                        <Button
                          variant="ghost"
                          size="xs"
                          type="button"
                          className="mt-2"
                          onClick={() =>
                            setValue(
                              `secrets.${index}.metadata`,
                              [
                                ...metadata,
                                {
                                  id: crypto.randomUUID(),
                                  key: "",
                                  value: "",
                                  isEncrypted:
                                    currentProject?.enforceEncryptedSecretManagerSecretMetadata ??
                                    false
                                }
                              ],
                              { shouldDirty: true }
                            )
                          }
                        >
                          <PlusIcon className="mr-1 size-4" />
                          Add Entry
                        </Button>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            appendSecret({
              key: "",
              value: "",
              comment: "",
              skipMultilineEncoding: false,
              tags: [],
              metadata: []
            });
            setTimeout(() => secretKeyInputRefs.current[secretFields.length]?.focus(), 0);
          }}
        >
          <PlusIcon className="size-4" />
          Add More
        </Button>
      </div>
      <SheetFooter className="justify-between border-t">
        {onUploadSecrets && (
          <Button variant="outline" type="button" onClick={() => onUploadSecrets()}>
            <UploadIcon className="size-4" />
            Upload
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button onClick={onClose} variant="ghost" type="button">
            Cancel
          </Button>
          <Button
            isPending={isSubmitting}
            isDisabled={isSubmitting}
            variant="project"
            type="submit"
          >
            Create
          </Button>
        </div>
      </SheetFooter>
    </form>
  );
};
