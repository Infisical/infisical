import { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon, TrashIcon, TriangleAlertIcon } from "lucide-react";
import { z } from "zod";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertDescription,
  Button,
  Checkbox,
  Combobox,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  IconButton,
  Input,
  SecretInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SheetFooter,
  TextArea
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { useGetWsTags } from "@app/hooks/api";
import { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";

import { TSecretEditChanges } from "../CreateSecretForm/CreateSecretForm";

const formSchema = z
  .object({
    environments: z.array(z.string()).min(1, "Select at least one environment."),
    keyAction: z.enum(["keep", "rename"]),
    key: z.string(),
    valueAction: z.enum(["keep", "replace", "empty"]),
    value: z.string(),
    commentAction: z.enum(["keep", "replace", "remove"]),
    comment: z.string(),
    tagsAction: z.enum(["keep", "add", "remove", "replace", "removeAll"]),
    tags: z.array(z.object({ id: z.string(), slug: z.string() })),
    metadataAction: z.enum(["keep", "set", "remove"]),
    metadata: z.array(
      z.object({
        key: z.string(),
        value: z.string(),
        encryption: z.enum(["keep", "encrypt", "unencrypted"])
      })
    ),
    metadataKeys: z.array(z.string()),
    encodingAction: z.enum(["keep", "enable", "disable"])
  })
  .superRefine((values, context) => {
    const issue = (path: (string | number)[], message: string) =>
      context.addIssue({ code: z.ZodIssueCode.custom, path, message });

    if (values.keyAction === "rename" && !values.key.trim()) {
      issue(["key"], "Enter a new secret key.");
    }
    if (values.valueAction === "replace" && values.value.trim().length === 0) {
      issue(["value"], "Enter a replacement value, or choose Set Empty Value.");
    }
    if (values.commentAction === "replace" && !values.comment.trim()) {
      issue(["comment"], "Enter a replacement comment, or choose Remove Comment.");
    }
    if (["add", "remove", "replace"].includes(values.tagsAction) && !values.tags.length) {
      issue(["tags"], "Select at least one tag, or choose Remove All.");
    }
    if (values.metadataAction === "set") {
      if (!values.metadata.length) issue(["metadata"], "Add at least one metadata entry.");
      const keys = new Set<string>();
      values.metadata.forEach((entry, index) => {
        const key = entry.key.trim();
        if (!key) issue(["metadata", index, "key"], "Enter a metadata key.");
        if (keys.has(key)) issue(["metadata", index, "key"], "Metadata keys must be unique.");
        keys.add(key);
      });
    }
    if (values.metadataAction === "remove" && !values.metadataKeys.length) {
      issue(["metadataKeys"], "Select at least one metadata key.");
    }
  });

type TFormSchema = z.infer<typeof formSchema>;
type Environment = { name: string; slug: string };

export type SharedSecretUpdateFormProps = {
  secretKey: string;
  environments: Environment[];
  secrets: SecretV3RawSanitized[];
  getEnvironmentError: (slug: string) => string | undefined;
  allowRename: boolean;
  isSaving: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onClose: () => void;
  onSubmit: (updates: { environment: Environment; changes: TSecretEditChanges }[]) => Promise<void>;
};

const ActionSelect = ({
  id,
  value,
  onValueChange,
  options,
  isDisabled
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  isDisabled: boolean;
}) => (
  <Select value={value} onValueChange={onValueChange} disabled={isDisabled}>
    <SelectTrigger id={id} className="w-full">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      {options.map((option) => (
        <SelectItem key={option.value} value={option.value}>
          {option.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

export const SharedSecretUpdateForm = ({
  secretKey,
  environments,
  secrets,
  getEnvironmentError,
  allowRename,
  isSaving,
  onDirtyChange,
  onClose,
  onSubmit
}: SharedSecretUpdateFormProps) => {
  const { currentProject, projectId } = useProject();
  const { permission } = useProjectPermission();
  const enforceEncryption = Boolean(currentProject?.enforceEncryptedSecretManagerSecretMetadata);
  const canReadTags = permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);
  const {
    data: projectTags,
    isPending: isTagsLoading,
    isError: isTagsError
  } = useGetWsTags(projectId, canReadTags);
  const [snapshots] = useState(() =>
    secrets
      .filter((secret) => secret.key === secretKey)
      .map((secret) => ({
        env: secret.env,
        comment: secret.comment ?? "",
        tags: secret.tags?.map(({ id, slug }) => ({ id, slug })) ?? [],
        metadata:
          secret.secretMetadata?.map(({ key, value, isEncrypted }) => ({
            key,
            value,
            isEncrypted: isEncrypted ?? false
          })) ?? [],
        skipMultilineEncoding: secret.skipMultilineEncoding ?? false
      }))
  );
  const environmentError = (slug: string) =>
    getEnvironmentError(slug) ??
    (snapshots.some((secret) => secret.env === slug)
      ? undefined
      : "This secret does not exist in this environment. Shared updates never create secrets.");

  const {
    control,
    register,
    watch,
    setError,
    clearErrors,
    handleSubmit,
    formState: { isDirty, isSubmitting, errors }
  } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      environments: environments
        .filter((environment) => !environmentError(environment.slug))
        .map((environment) => environment.slug),
      keyAction: "keep",
      key: secretKey,
      valueAction: "keep",
      value: "",
      commentAction: "keep",
      comment: "",
      tagsAction: "keep",
      tags: [],
      metadataAction: "keep",
      metadata: [],
      metadataKeys: [],
      encodingAction: "keep"
    }
  });
  const {
    fields: metadataFields,
    append,
    remove
  } = useFieldArray({
    control,
    name: "metadata"
  });
  const values = watch();
  const isBusy = isSaving || isSubmitting;
  const selectedEnvironments = environments.filter((environment) =>
    values.environments.includes(environment.slug)
  );
  const selectedSnapshots = snapshots.filter((secret) => values.environments.includes(secret.env));
  const unavailableSelected = selectedEnvironments.filter((environment) =>
    environmentError(environment.slug)
  );
  const tagOptions = projectTags?.map(({ id, slug }) => ({ id, slug })) ?? [];
  const metadataKeyOptions = [
    ...new Set(selectedSnapshots.flatMap((secret) => secret.metadata.map((entry) => entry.key)))
  ];
  const hasOperations = [
    values.keyAction,
    values.valueAction,
    values.commentAction,
    values.tagsAction,
    values.metadataAction,
    values.encodingAction
  ].some((action) => action !== "keep");
  const selectedScope = selectedEnvironments.map((environment) => environment.name).join(", ");

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const submitForm = handleSubmit(async (data) => {
    clearErrors("root");
    const selected = environments.filter((environment) =>
      data.environments.includes(environment.slug)
    );
    const invalidEnvironment = selected.find((environment) => environmentError(environment.slug));
    if (invalidEnvironment || selected.length !== data.environments.length) {
      setError("root.scope", {
        message: invalidEnvironment
          ? `${invalidEnvironment.name}: ${environmentError(invalidEnvironment.slug)}`
          : "An environment is no longer available. Update your selection and try again."
      });
      return;
    }
    if (data.keyAction === "rename" && !allowRename) {
      setError("key", { message: "Remove personal overrides before renaming this secret." });
      return;
    }
    if (data.tagsAction !== "keep" && !canReadTags) {
      setError("tags", { message: "You do not have permission to read project tags." });
      return;
    }

    const plans = selected.flatMap((environment) => {
      const snapshot = snapshots.find((secret) => secret.env === environment.slug)!;
      const changes: TSecretEditChanges = {};
      if (data.keyAction === "rename" && data.key.trim() !== secretKey) {
        changes.newSecretName = data.key.trim();
      }
      if (data.valueAction === "replace") changes.value = data.value;
      if (data.valueAction === "empty") changes.value = "";
      if (data.commentAction !== "keep") {
        const comment = data.commentAction === "remove" ? "" : data.comment;
        if (comment !== snapshot.comment) changes.secretComment = comment;
      }
      if (data.tagsAction !== "keep") {
        let { tags } = snapshot;
        if (data.tagsAction === "add") {
          tags = [
            ...new Map([...snapshot.tags, ...data.tags].map((tag) => [tag.id, tag])).values()
          ];
        }
        if (data.tagsAction === "remove") {
          const ids = new Set(data.tags.map((tag) => tag.id));
          tags = snapshot.tags.filter((tag) => !ids.has(tag.id));
        }
        if (data.tagsAction === "replace") tags = data.tags;
        if (data.tagsAction === "removeAll") tags = [];
        if (
          tags.length !== snapshot.tags.length ||
          tags.some((tag) => !snapshot.tags.some((existing) => existing.id === tag.id))
        )
          changes.tags = tags.map(({ id, slug }) => ({ id, slug }));
      }
      if (data.metadataAction !== "keep") {
        let { metadata } = snapshot;
        if (data.metadataAction === "set") {
          const entries = new Map(snapshot.metadata.map((entry) => [entry.key, entry]));
          data.metadata.forEach((entry) => {
            const key = entry.key.trim();
            const isEncrypted =
              enforceEncryption ||
              entry.encryption === "encrypt" ||
              (entry.encryption === "keep" && Boolean(entries.get(key)?.isEncrypted));
            entries.set(key, { key, value: entry.value, isEncrypted });
          });
          metadata = [...entries.values()];
        }
        if (data.metadataAction === "remove") {
          const keys = new Set(data.metadataKeys);
          metadata = snapshot.metadata.filter((entry) => !keys.has(entry.key));
        }
        if (JSON.stringify(metadata) !== JSON.stringify(snapshot.metadata)) {
          changes.secretMetadata = metadata;
        }
      }
      if (data.encodingAction !== "keep") {
        const skipMultilineEncoding = data.encodingAction === "disable";
        if (skipMultilineEncoding !== snapshot.skipMultilineEncoding) {
          changes.skipMultilineEncoding = skipMultilineEncoding;
        }
      }
      return Object.keys(changes).length ? [{ environment, changes }] : [];
    });

    if (!plans.length) {
      setError("root.plan", {
        message: "These operations do not change any selected environment."
      });
      return;
    }
    try {
      await onSubmit(plans);
    } catch {
      setError("root.submit", {
        message: "Updates were not completed. Your draft has been kept."
      });
    }
  });

  return (
    <form onSubmit={submitForm} noValidate className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex thin-scrollbar flex-1 flex-col gap-5 overflow-y-auto p-4">
        <p className="text-xs text-muted">
          Choose the fields and environments to update. Unchanged fields keep their
          environment-specific data.
        </p>
        <Controller
          control={control}
          name="environments"
          render={({ field }) => (
            <Field>
              <FieldLabel>Environments</FieldLabel>
              <FieldContent>
                <div className="flex flex-col gap-3 rounded-md border border-border bg-container p-3">
                  {environments.map((environment) => {
                    const reason = environmentError(environment.slug);
                    return (
                      <Field key={environment.slug} orientation="horizontal">
                        <Checkbox
                          id={`shared-update-env-${environment.slug}`}
                          variant="project"
                          isChecked={field.value.includes(environment.slug)}
                          isDisabled={isBusy || Boolean(reason)}
                          aria-describedby={
                            reason ? `shared-update-env-${environment.slug}-reason` : undefined
                          }
                          onCheckedChange={(checked) =>
                            field.onChange(
                              checked
                                ? [...field.value, environment.slug]
                                : field.value.filter((slug) => slug !== environment.slug)
                            )
                          }
                        />
                        <FieldContent>
                          <FieldLabel htmlFor={`shared-update-env-${environment.slug}`}>
                            {environment.name}
                          </FieldLabel>
                          {reason && (
                            <FieldDescription id={`shared-update-env-${environment.slug}-reason`}>
                              {reason}
                            </FieldDescription>
                          )}
                        </FieldContent>
                      </Field>
                    );
                  })}
                </div>
                {unavailableSelected.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    isDisabled={isBusy}
                    onClick={() =>
                      field.onChange(field.value.filter((slug) => !environmentError(slug)))
                    }
                  >
                    Deselect Unavailable Environments
                  </Button>
                )}
                <FieldDescription>
                  Only existing, editable secrets can be updated. Eligibility is checked again
                  before review.
                </FieldDescription>
                <FieldError errors={[errors.environments, errors.root?.scope]} />
              </FieldContent>
            </Field>
          )}
        />
        <Field>
          <FieldLabel htmlFor={allowRename ? "shared-update-key-action" : "shared-update-key"}>
            Key
          </FieldLabel>
          <FieldContent>
            {allowRename && (
              <Controller
                control={control}
                name="keyAction"
                render={({ field }) => (
                  <ActionSelect
                    id="shared-update-key-action"
                    value={field.value}
                    onValueChange={field.onChange}
                    isDisabled={isBusy}
                    options={[
                      { value: "keep", label: "Keep Existing" },
                      { value: "rename", label: "Rename" }
                    ]}
                  />
                )}
              />
            )}
            <Controller
              control={control}
              name="key"
              render={({ field }) => (
                <Input
                  {...field}
                  id="shared-update-key"
                  className="font-mono"
                  aria-label="Secret Key"
                  onChange={(event) =>
                    field.onChange(
                      currentProject?.autoCapitalization
                        ? event.target.value.toUpperCase()
                        : event.target.value
                    )
                  }
                  readOnly={!allowRename || values.keyAction === "keep"}
                  disabled={isBusy}
                />
              )}
            />
            <FieldDescription>
              {allowRename
                ? "Renaming affects only the selected environments."
                : "The key is read-only. Renaming is unavailable while personal overrides exist."}
            </FieldDescription>
            <FieldError errors={[errors.key]} />
          </FieldContent>
        </Field>
        <Field>
          <FieldLabel htmlFor="shared-update-value-action">Value</FieldLabel>
          <FieldContent>
            <Controller
              control={control}
              name="valueAction"
              render={({ field }) => (
                <ActionSelect
                  id="shared-update-value-action"
                  value={field.value}
                  onValueChange={field.onChange}
                  isDisabled={isBusy}
                  options={[
                    { value: "keep", label: "Keep Existing" },
                    { value: "replace", label: "Replace" },
                    { value: "empty", label: "Set Empty Value" }
                  ]}
                />
              )}
            />
            {values.valueAction === "replace" && (
              <Controller
                control={control}
                name="value"
                render={({ field }) => (
                  <SecretInput
                    id="shared-update-value"
                    {...field}
                    valueAlwaysHidden
                    isDisabled={isBusy}
                    aria-label="Replacement Secret Value"
                    isError={Boolean(errors.value)}
                    placeholder="Enter a replacement value..."
                  />
                )}
              />
            )}
            <FieldDescription>
              Existing values stay unchanged unless you choose Replace or Set Empty Value.
            </FieldDescription>
            {values.valueAction === "replace" && <FieldError errors={[errors.value]} />}
          </FieldContent>
        </Field>
        {values.valueAction !== "keep" && selectedEnvironments.length > 0 && (
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertDescription>
              {values.valueAction === "empty"
                ? "This sets an empty value"
                : "This replaces the value"}{" "}
              in {selectedScope} only. Unselected environments keep their existing values.
            </AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldLabel htmlFor="shared-update-comment-action">Comment</FieldLabel>
          <FieldContent>
            <Controller
              control={control}
              name="commentAction"
              render={({ field }) => (
                <ActionSelect
                  id="shared-update-comment-action"
                  value={field.value}
                  onValueChange={field.onChange}
                  isDisabled={isBusy}
                  options={[
                    { value: "keep", label: "Keep Existing" },
                    { value: "replace", label: "Replace" },
                    { value: "remove", label: "Remove Comment" }
                  ]}
                />
              )}
            />
            {values.commentAction === "replace" && (
              <TextArea
                id="shared-update-comment"
                {...register("comment")}
                disabled={isBusy}
                aria-label="Replacement Comment"
                placeholder="Enter a replacement comment..."
                className="max-h-32 min-h-16 resize-y"
              />
            )}
            {values.commentAction === "replace" && <FieldError errors={[errors.comment]} />}
            {values.commentAction !== "keep" && selectedEnvironments.length > 0 && (
              <FieldDescription className="text-warning">
                {values.commentAction === "remove" ? "Removes comments" : "Replaces comments"} in{" "}
                {selectedScope} only. Unselected environments keep their comments.
              </FieldDescription>
            )}
          </FieldContent>
        </Field>
        <Accordion type="single" collapsible variant="ghost">
          <AccordionItem value="advanced" className="border-b-0">
            <AccordionTrigger>Advanced Options</AccordionTrigger>
            <AccordionContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="shared-update-tags-action">Tags</FieldLabel>
                  <FieldContent>
                    <Controller
                      control={control}
                      name="tagsAction"
                      render={({ field }) => (
                        <ActionSelect
                          id="shared-update-tags-action"
                          value={field.value}
                          onValueChange={field.onChange}
                          isDisabled={isBusy || !canReadTags}
                          options={[
                            { value: "keep", label: "Keep Existing" },
                            { value: "add", label: "Add" },
                            { value: "remove", label: "Remove Selected" },
                            { value: "replace", label: "Replace" },
                            { value: "removeAll", label: "Remove All" }
                          ]}
                        />
                      )}
                    />
                    {["add", "remove", "replace"].includes(values.tagsAction) && (
                      <Controller
                        control={control}
                        name="tags"
                        render={({ field }) => (
                          <Combobox
                            id="shared-update-tags"
                            aria-label="Tags to Apply"
                            multiple
                            modal
                            options={tagOptions}
                            value={field.value}
                            onValueChange={field.onChange}
                            getOptionLabel={(tag) => tag.slug}
                            getOptionValue={(tag) => tag.id}
                            isDisabled={isBusy || !canReadTags}
                            isLoading={isTagsLoading && canReadTags}
                            isError={Boolean(errors.tags)}
                            placeholder="Select tags..."
                            searchAriaLabel="Search Project Tags"
                            emptyMessage="No tags found."
                          />
                        )}
                      />
                    )}
                    <FieldDescription>
                      {!canReadTags
                        ? "You do not have permission to read project tags."
                        : "Add merges tags into each environment. Remove Selected keeps every other tag."}
                    </FieldDescription>
                    {isTagsError && (
                      <FieldDescription className="text-danger">
                        Project tags could not be loaded. Existing tags are unchanged.
                      </FieldDescription>
                    )}
                    {values.tagsAction === "replace" && selectedEnvironments.length > 0 && (
                      <FieldDescription className="text-warning">
                        Replaces all tags in {selectedScope} only.
                      </FieldDescription>
                    )}
                    {values.tagsAction === "removeAll" && selectedEnvironments.length > 0 && (
                      <FieldDescription className="text-warning">
                        Removes all tags in {selectedScope} only.
                      </FieldDescription>
                    )}
                    <FieldError errors={[errors.tags]} />
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="shared-update-metadata-action">Metadata</FieldLabel>
                  <FieldContent>
                    <Controller
                      control={control}
                      name="metadataAction"
                      render={({ field }) => (
                        <ActionSelect
                          id="shared-update-metadata-action"
                          value={field.value}
                          onValueChange={field.onChange}
                          isDisabled={isBusy}
                          options={[
                            { value: "keep", label: "Keep Existing" },
                            { value: "set", label: "Set Entries" },
                            { value: "remove", label: "Remove Keys" }
                          ]}
                        />
                      )}
                    />
                    {values.metadataAction === "set" && (
                      <div className="flex flex-col gap-3 rounded-md border border-border bg-container p-3">
                        {metadataFields.map((entry, index) => (
                          <div
                            key={entry.id}
                            className="flex flex-col gap-3 border-b border-border pb-3"
                          >
                            <div className="flex items-start gap-2">
                              <Field className="min-w-0 flex-1">
                                <FieldLabel htmlFor={`shared-update-metadata-${index}-key`}>
                                  Key
                                </FieldLabel>
                                <FieldContent>
                                  <Input
                                    id={`shared-update-metadata-${index}-key`}
                                    disabled={isBusy}
                                    {...register(`metadata.${index}.key`)}
                                    placeholder="Enter key..."
                                  />
                                  <FieldError errors={[errors.metadata?.[index]?.key]} />
                                </FieldContent>
                              </Field>
                              <IconButton
                                type="button"
                                variant="ghost"
                                size="xs"
                                className="mt-6"
                                aria-label={`Remove Metadata Entry ${index + 1}`}
                                isDisabled={isBusy}
                                onClick={() => remove(index)}
                              >
                                <TrashIcon className="size-4" />
                              </IconButton>
                            </div>
                            <Field>
                              <FieldLabel htmlFor={`shared-update-metadata-${index}-value`}>
                                Value
                              </FieldLabel>
                              <FieldContent>
                                <Controller
                                  control={control}
                                  name={`metadata.${index}.value`}
                                  render={({ field }) => (
                                    <SecretInput
                                      id={`shared-update-metadata-${index}-value`}
                                      {...field}
                                      valueAlwaysHidden
                                      isDisabled={isBusy}
                                      aria-label={`Metadata Value ${index + 1}`}
                                      placeholder="Enter value..."
                                    />
                                  )}
                                />
                              </FieldContent>
                            </Field>
                            <Field>
                              <FieldLabel htmlFor={`shared-update-metadata-${index}-encryption`}>
                                Encryption
                              </FieldLabel>
                              <FieldContent>
                                <Controller
                                  control={control}
                                  name={`metadata.${index}.encryption`}
                                  render={({ field }) => (
                                    <ActionSelect
                                      id={`shared-update-metadata-${index}-encryption`}
                                      value={enforceEncryption ? "encrypt" : field.value}
                                      onValueChange={field.onChange}
                                      isDisabled={isBusy || enforceEncryption}
                                      options={[
                                        { value: "keep", label: "Keep Existing" },
                                        { value: "encrypt", label: "Encrypt" },
                                        { value: "unencrypted", label: "Do Not Encrypt" }
                                      ]}
                                    />
                                  )}
                                />
                                <FieldDescription>
                                  {enforceEncryption
                                    ? "This project requires new and updated entries to be encrypted."
                                    : "Keep Existing preserves each environment's encryption setting. New keys are unencrypted."}
                                </FieldDescription>
                              </FieldContent>
                            </Field>
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          isDisabled={isBusy}
                          onClick={() => append({ key: "", value: "", encryption: "keep" })}
                        >
                          <PlusIcon className="size-3" /> Add Entry
                        </Button>
                        <FieldError errors={[errors.metadata?.root, errors.metadata]} />
                      </div>
                    )}
                    {values.metadataAction === "remove" && (
                      <Controller
                        control={control}
                        name="metadataKeys"
                        render={({ field }) => (
                          <Combobox
                            id="shared-update-metadata-keys"
                            multiple
                            modal
                            options={metadataKeyOptions}
                            value={field.value}
                            onValueChange={field.onChange}
                            getOptionLabel={(key) => key}
                            getOptionValue={(key) => key}
                            isDisabled={isBusy}
                            isError={Boolean(errors.metadataKeys)}
                            placeholder="Select keys to remove..."
                            searchAriaLabel="Search Metadata Keys"
                            emptyMessage="No metadata keys in the selected environments."
                          />
                        )}
                      />
                    )}
                    {values.metadataAction === "remove" && (
                      <FieldError errors={[errors.metadataKeys]} />
                    )}
                    <FieldDescription>
                      Entries merge by key in each selected environment. Other keys and their
                      encryption settings are preserved. Remove Keys only removes the selected keys.
                    </FieldDescription>
                  </FieldContent>
                </Field>
                <Field>
                  <FieldLabel htmlFor="shared-update-encoding-action">
                    Multiline Encoding
                  </FieldLabel>
                  <FieldContent>
                    <Controller
                      control={control}
                      name="encodingAction"
                      render={({ field }) => (
                        <ActionSelect
                          id="shared-update-encoding-action"
                          value={field.value}
                          onValueChange={field.onChange}
                          isDisabled={isBusy}
                          options={[
                            { value: "keep", label: "Keep Existing" },
                            { value: "enable", label: "Enable" },
                            { value: "disable", label: "Disable" }
                          ]}
                        />
                      )}
                    />
                    <FieldDescription>
                      When enabled, newlines are escaped as \n for environment variable output.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </FieldGroup>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <FieldError errors={[errors.root?.plan, errors.root?.submit]} />
      </div>
      <SheetFooter className="justify-end border-t">
        <Button type="button" variant="ghost" onClick={onClose} isDisabled={isBusy}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="project"
          isPending={isBusy}
          isDisabled={isBusy || !hasOperations || !selectedEnvironments.length}
        >
          Review Updates
        </Button>
      </SheetFooter>
    </form>
  );
};
