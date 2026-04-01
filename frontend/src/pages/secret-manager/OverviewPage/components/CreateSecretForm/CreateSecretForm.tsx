import { ClipboardEvent, useMemo, useRef, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangleIcon, InfoIcon, PlusIcon, TrashIcon, TriangleAlertIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  InfisicalSecretInput,
  PasswordGenerator,
  SheetFooter,
  Switch,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableIconButton,
  UnstableInput
} from "@app/components/v3";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel
} from "@app/components/v3/generic/Field";
import { CreatableSelect, FilterableSelect } from "@app/components/v3/generic/ReactSelect";
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

const formSchema = z
  .object({
    key: z.string().trim().min(1, "Key is required"),
    value: z.string().optional(),
    comment: z.string().optional(),
    skipMultilineEncoding: z.boolean().optional(),
    environments: z
      .object({ name: z.string(), slug: z.string() })
      .array()
      .min(1, { message: "Required" }),
    tags: z.array(z.object({ label: z.string().trim(), value: z.string().trim() })).optional(),
    metadata: z
      .array(
        z.object({
          key: z.string().min(1, "Key is required"),
          value: z.string(),
          isEncrypted: z.boolean().default(false)
        })
      )
      .optional()
  })
  .refine((data) => data.key !== undefined, {
    message: "Please enter secret name"
  });

type TFormSchema = z.infer<typeof formSchema>;

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
};

export const CreateSecretForm = ({
  secretPath = "/",
  defaultSelectedEnvs,
  onClose,
  isBatchMode,
  onBatchSecretCreate
}: Props) => {
  const { currentProject, projectId } = useProject();
  const { permission } = useProjectPermission();
  const canReadTags = permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);
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
    resolver: zodResolver(formSchema),
    defaultValues: {
      environments: defaultEnvs,
      skipMultilineEncoding: false,
      metadata: []
    }
  });

  const {
    fields: metadataFields,
    append: appendMetadata,
    remove: removeMetadata
  } = useFieldArray({ control, name: "metadata" });

  const { mutateAsync: createSecretV3 } = useCreateSecretV3();
  const { mutateAsync: getOrCreateFolder } = useGetOrCreateFolder();
  const { data: projectTags, isPending: isTagsLoading } = useGetWsTags(
    canReadTags ? projectId : ""
  );

  const tagOptions = useMemo(
    () => projectTags?.map((el) => ({ label: el.slug, value: el.id })),
    [projectTags]
  );

  const [createMore, setCreateMore] = useState(false);
  const secretKeyInputRef = useRef<HTMLInputElement>(null);
  const secretKey = watch("key");

  const handleFormSubmit = async ({
    key,
    value,
    comment,
    skipMultilineEncoding,
    environments: selectedEnv,
    tags,
    metadata
  }: TFormSchema) => {
    const filteredMetadata = metadata?.filter((m) => m.key && m.value);

    if (isBatchMode && onBatchSecretCreate) {
      selectedEnv.forEach((env) => {
        onBatchSecretCreate({
          env: env.slug,
          key,
          value: value || "",
          comment: comment || undefined,
          skipMultilineEncoding: skipMultilineEncoding || undefined,
          tags: tags?.map((t) => ({ id: t.value, slug: t.label })),
          metadata: filteredMetadata?.length ? filteredMetadata : undefined
        });
      });

      if (createMore) {
        setValue("key", "");
        setValue("value", "");
        setValue("comment", "");
        setValue("skipMultilineEncoding", false);
        setValue("tags", []);
        setValue("metadata", []);
        setTimeout(() => secretKeyInputRef.current?.focus(), 150);
      } else {
        onClose();
        reset();
      }
      return;
    }

    const promises = selectedEnv.map(async (env) => {
      const environment = env.slug;
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
            environment,
            name: folderName
          });
        }
      }

      return {
        ...(await createSecretV3({
          environment,
          projectId,
          secretPath,
          secretKey: key,
          secretValue: value || "",
          secretComment: comment || "",
          skipMultilineEncoding: skipMultilineEncoding || undefined,
          type: SecretType.Shared,
          tagIds: tags?.map((el) => el.value),
          secretMetadata: filteredMetadata?.length ? filteredMetadata : undefined
        })),
        environment
      };
    });

    const results = await Promise.allSettled(promises);
    const forApprovalEnvs = results
      .map((result) =>
        result.status === "fulfilled" && "approval" in result.value
          ? result.value.environment
          : undefined
      )
      .filter(Boolean) as string[];

    const updatedEnvs = results
      .map((result) =>
        result.status === "fulfilled" && !("approval" in result.value)
          ? result.value.environment
          : undefined
      )
      .filter(Boolean) as string[];

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
    }

    if (!updatedEnvs.length && !forApprovalEnvs.length) {
      // this should only occur when a toast notifcation is created from failed mutation
      console.warn("failed to create secrets");
    } else if (createMore) {
      setValue("key", "");
      setValue("value", "");
      setValue("comment", "");
      setValue("skipMultilineEncoding", false);
      setValue("tags", []);
      setValue("metadata", []);
      setTimeout(() => secretKeyInputRef.current?.focus(), 150);
    } else {
      onClose();
      reset();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const delimitters = [":", "="];
    const pastedContent = e.clipboardData.getData("text");
    const { key, value } = getKeyValue(pastedContent, delimitters);

    const isWholeKeyHighlighted =
      secretKeyInputRef.current &&
      secretKeyInputRef.current.selectionStart === 0 &&
      secretKeyInputRef.current.selectionEnd === secretKeyInputRef.current.value.length;

    if (!secretKey || isWholeKeyHighlighted) {
      e.preventDefault();
      const keyStr = currentProject.autoCapitalization ? key.toUpperCase() : key;
      setValue("key", keyStr);
      if (value) {
        setValue("value", value);
      }
    }
  };

  const createWsTag = useCreateWsTag();

  const createNewTag = async (slug: string) => {
    const parsedSlug = slugSchema().parse(slug);
    const newTag = await createWsTag.mutateAsync({
      projectId,
      tagSlug: parsedSlug,
      tagColor: ""
    });
    const currentTags = getValues("tags") ?? [];
    setValue("tags", [...currentTags, { label: newTag.slug, value: newTag.id }], {
      shouldDirty: true
    });
  };

  return (
    <form
      onSubmit={handleSubmit(handleFormSubmit)}
      noValidate
      className="flex flex-1 flex-col gap-4 overflow-hidden"
    >
      <div className="flex thin-scrollbar flex-1 flex-col gap-4 overflow-y-auto p-4">
        {defaultSelectedEnvs?.length === 1 ? null : (
          <Controller
            control={control}
            name="environments"
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Environments</FieldLabel>
                <FieldContent>
                  <FilterableSelect
                    isMulti
                    isError={Boolean(error)}
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
                    onChange={onChange}
                    placeholder="Select environments to create secret in..."
                    getOptionLabel={(option) => option.name}
                    getOptionValue={(option) => option.slug}
                  />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
        )}

        <Controller
          control={control}
          name="key"
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Key</FieldLabel>
              <FieldContent>
                <div className="relative">
                  <UnstableInput
                    ref={secretKeyInputRef}
                    value={field.value ?? ""}
                    onChange={(e) => {
                      const val = currentProject?.autoCapitalization
                        ? e.target.value.toUpperCase()
                        : e.target.value;
                      field.onChange(val);
                    }}
                    onBlur={field.onBlur}
                    placeholder="Type your secret name"
                    onPaste={handlePaste}
                    autoFocus
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
                        Secret key contains whitespaces. If this is the desired format, you need to
                        provide it as{" "}
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

        <Controller
          control={control}
          name="value"
          render={({ field }) => (
            <Field>
              <FieldLabel>
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
              <FieldContent>
                <div className="flex items-start gap-2">
                  <InfisicalSecretInput
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    placeholder="Enter secret value..."
                  />
                  <PasswordGenerator onUsePassword={field.onChange} />
                </div>
                <FieldError errors={[errors.value]} />
              </FieldContent>
            </Field>
          )}
        />

        <Controller
          control={control}
          name="comment"
          render={({ field }) => (
            <Field>
              <FieldLabel>Comment</FieldLabel>
              <FieldContent>
                <TextArea
                  {...field}
                  placeholder="Add a comment for this secret..."
                  className="max-h-32 min-h-[60px] resize-y"
                />
              </FieldContent>
            </Field>
          )}
        />

        <Controller
          control={control}
          name="tags"
          render={({ field }) => (
            <Field>
              <FieldLabel>Tags</FieldLabel>
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
                    placeholder="Select tags to assign to secret..."
                    isValidNewOption={(v) => slugSchema().safeParse(v).success}
                    name="tagIds"
                    isDisabled={!canReadTags}
                    isLoading={isTagsLoading && canReadTags}
                    options={tagOptions}
                    value={field.value}
                    onChange={field.onChange}
                    onCreateOption={createNewTag}
                  />
                )}
              </FieldContent>
            </Field>
          )}
        />

        <Controller
          control={control}
          name="skipMultilineEncoding"
          render={({ field }) => (
            <Field orientation="horizontal">
              <FieldLabel className="cursor-pointer">Enable Multiline Encoding</FieldLabel>
              <Switch variant="project" checked={field.value} onCheckedChange={field.onChange} />
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
            {metadataFields.length === 0 && (
              <p className="text-center text-sm text-muted">
                No metadata entries. Click below to add.
              </p>
            )}
            {metadataFields.map((metaField, index) => (
              <div key={metaField.id} className="flex items-start gap-3">
                <Field className="flex-1">
                  {index === 0 && <FieldLabel className="text-xs">Key</FieldLabel>}
                  <FieldContent>
                    <Controller
                      control={control}
                      name={`metadata.${index}.key`}
                      render={({ field: inputField, fieldState: { error } }) => (
                        <>
                          <UnstableInput {...inputField} placeholder="Enter key" className="h-8" />
                          <FieldError errors={[error]} />
                        </>
                      )}
                    />
                  </FieldContent>
                </Field>

                <Field className="flex-1">
                  {index === 0 && <FieldLabel className="text-xs">Value</FieldLabel>}
                  <FieldContent>
                    <Controller
                      control={control}
                      name={`metadata.${index}.value`}
                      render={({ field: inputField, fieldState: { error } }) => (
                        <>
                          <UnstableInput
                            {...inputField}
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
                  {index === 0 && <FieldLabel className="text-xs">Encrypt</FieldLabel>}
                  <Controller
                    control={control}
                    name={`metadata.${index}.isEncrypted`}
                    render={({ field: switchField }) => (
                      <Switch
                        className="mt-2"
                        variant="project"
                        size="default"
                        checked={switchField.value}
                        onCheckedChange={switchField.onChange}
                      />
                    )}
                  />
                </Field>

                <UnstableIconButton
                  variant="ghost"
                  size="xs"
                  type="button"
                  className={twMerge(
                    index === 0 ? "mt-6.5" : "mt-0.5",
                    "transition-transform hover:text-danger"
                  )}
                  onClick={() => removeMetadata(index)}
                >
                  <TrashIcon className="size-4" />
                </UnstableIconButton>
              </div>
            ))}
          </div>

          <Button
            variant="ghost"
            size="xs"
            type="button"
            className="mt-2"
            onClick={() =>
              appendMetadata({
                key: "",
                value: "",
                isEncrypted: currentProject?.enforceEncryptedSecretManagerSecretMetadata ?? false
              })
            }
          >
            <PlusIcon className="mr-1 size-4" />
            Add Entry
          </Button>
        </div>
      </div>
      <SheetFooter className="border-t">
        <Button isPending={isSubmitting} isDisabled={isSubmitting} variant="project" type="submit">
          Create Secret
        </Button>
        <Button onClick={onClose} variant="outline" className="mr-auto" type="button">
          Cancel
        </Button>
        <Field orientation="horizontal" className="my-auto ml-auto w-fit">
          <FieldLabel>Create More</FieldLabel>
          <Switch
            id="create-more"
            variant="project"
            checked={createMore}
            onCheckedChange={setCreateMore}
          />
        </Field>
      </SheetFooter>
    </form>
  );
};
