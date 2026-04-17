import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyIcon, TagsIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  CreatableSelect,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  Switch,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { useCreateWsTag, useGetWsTags, useUpdateSecretBatch } from "@app/hooks/api";
import { ProjectEnv } from "@app/hooks/api/projects/types";
import { SecretType, SecretV3RawSanitized } from "@app/hooks/api/secrets/types";
import { slugSchema } from "@app/lib/schemas";

const formSchema = z.object({
  tags: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .min(1, "Select at least one tag"),
  isReplaceMode: z.boolean().default(false)
});

type TFormSchema = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  secretPath: string;
  secrets: Record<string, Record<string, SecretV3RawSanitized>>;
  environments: ProjectEnv[];
  visibleEnvs: ProjectEnv[];
  onComplete: () => void;
};

type ContentProps = Omit<Props, "isOpen" | "onOpenChange"> & {
  onClose: () => void;
};

const BulkTagDialogContent = ({
  projectId,
  secretPath,
  secrets,
  environments,
  visibleEnvs,
  onComplete,
  onClose
}: ContentProps) => {
  const { permission } = useProjectPermission();
  const { mutateAsync: updateSecretBatch } = useUpdateSecretBatch();
  const { mutateAsync: createWsTag } = useCreateWsTag();

  const canReadTags = permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);
  const canAddTags = permission.can(ProjectPermissionActions.Create, ProjectPermissionSub.Tags);

  const { data: projectTags, isPending: isTagsLoading } = useGetWsTags(
    canReadTags ? projectId : ""
  );

  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    handleSubmit,
    control,
    setValue,
    getValues,
    watch,
    formState: { isValid }
  } = useForm<TFormSchema>({
    defaultValues: {
      tags: [],
      isReplaceMode: false
    },
    resolver: zodResolver(formSchema)
  });

  const isReplaceMode = watch("isReplaceMode");

  const selectedResources = useMemo(
    () =>
      Object.entries(secrets).map(([name, envRecord]) => ({
        name,
        envSlugs: new Set(Object.keys(envRecord))
      })),
    [secrets]
  );

  const tagOptions = useMemo(
    () => projectTags?.map((tag) => ({ label: tag.slug, value: tag.id })),
    [projectTags]
  );

  const handleCreateTag = async (inputValue: string) => {
    const parsedSlug = slugSchema().safeParse(inputValue);
    if (!parsedSlug.success) return;

    const newTag = await createWsTag({
      projectId,
      tagSlug: parsedSlug.data,
      tagColor: ""
    });
    const currentTags = getValues("tags");
    setValue("tags", [...currentTags, { label: newTag.slug, value: newTag.id }], {
      shouldDirty: true,
      shouldValidate: true
    });
  };

  const onSubmit = async (data: TFormSchema) => {
    setIsSubmitting(true);

    try {
      const selectedTagIds = data.tags.map((t) => t.value);

      // Group secrets by environment
      const secretsByEnv = Object.values(secrets).reduce<Record<string, SecretV3RawSanitized[]>>(
        (acc, secretRecord) => {
          Object.entries(secretRecord).forEach(([envSlug, secret]) => {
            const canEditSecret = permission.can(
              ProjectPermissionSecretActions.Edit,
              subject(ProjectPermissionSub.Secrets, {
                environment: envSlug,
                secretPath,
                secretName: secret.key,
                secretTags: (secret.tags || []).map((t) => t.slug)
              })
            );
            if (!canEditSecret) return;

            if (!acc[envSlug]) acc[envSlug] = [];
            acc[envSlug].push(secret);
          });
          return acc;
        },
        {}
      );

      const envSlugs = Object.keys(secretsByEnv);

      if (envSlugs.length === 0) {
        createNotification({
          type: "info",
          text: "You don't have access to tag the selected secrets"
        });
        return;
      }

      let hasApprovalRequest = false;
      let hasDirectUpdate = false;

      const results = await Promise.allSettled(
        envSlugs.map(async (envSlug) => {
          const envSecrets = secretsByEnv[envSlug];

          const secretUpdates = envSecrets.map((secret) => {
            let tagIds: string[];
            if (data.isReplaceMode) {
              tagIds = selectedTagIds;
            } else {
              const existingTagIds = (secret.tags || []).map((t) => t.id);
              tagIds = [...new Set([...existingTagIds, ...selectedTagIds])];
            }

            return {
              secretKey: secret.key,
              type: SecretType.Shared,
              tagIds
            };
          });

          const result = await updateSecretBatch({
            projectId,
            environment: envSlug,
            secretPath,
            secrets: secretUpdates
          });

          if (result && "approval" in result) {
            hasApprovalRequest = true;
          } else {
            hasDirectUpdate = true;
          }

          return { environment: envSlug };
        })
      );

      const allSucceeded = results.every((r) => r.status === "fulfilled");
      const someSucceeded = results.some((r) => r.status === "fulfilled");

      const failedEnvs = environments
        .filter(
          (env) =>
            !results.some((r) => r.status === "fulfilled" && r.value.environment === env.slug)
        )
        .filter((env) => secretsByEnv[env.slug])
        .map((env) => env.name);

      if (allSucceeded) {
        onClose();
        onComplete();
        if (hasDirectUpdate && hasApprovalRequest) {
          createNotification({
            type: "info",
            text: "Tags updated and an approval request was generated for protected environments"
          });
        } else if (hasApprovalRequest) {
          createNotification({
            type: "info",
            text: "An approval request has been generated for the tag changes"
          });
        } else {
          createNotification({
            type: "success",
            text: "Successfully updated tags on selected secrets"
          });
        }
      } else if (someSucceeded) {
        createNotification({
          type: "warning",
          text: `Tag update partially completed. The following environments could not be processed: ${failedEnvs.join(", ")}.`
        });
      } else {
        createNotification({
          type: "error",
          text: "Failed to update tags on selected secrets"
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedSecretCount = Object.keys(secrets).length;

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <form
      onSubmit={handleSubmit(onSubmit)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.preventDefault();
      }}
    >
      <DialogHeader>
        <DialogTitle>Bulk Tag Secrets</DialogTitle>
        <DialogDescription>
          Apply tags to {selectedSecretCount} selected secret{selectedSecretCount !== 1 ? "s" : ""}{" "}
          across all environments.
        </DialogDescription>
      </DialogHeader>
      {selectedResources.length > 0 && (
        <UnstableTable containerClassName="max-h-[40vh] mt-4 overflow-auto">
          <UnstableTableHeader className="sticky -top-px z-20 bg-container [&_tr]:border-b-0">
            <UnstableTableRow>
              <UnstableTableHead className="sticky left-0 z-20 w-10 max-w-10 min-w-10 border-b-0 bg-container shadow-[inset_0_-1px_0_var(--color-border)]">
                Type
              </UnstableTableHead>
              <UnstableTableHead className="sticky left-10 z-20 max-w-[30vw] min-w-[30vw] border-b-0 bg-container shadow-[inset_-1px_0_0_var(--color-border),inset_0_-1px_0_var(--color-border)]">
                Name
              </UnstableTableHead>
              {visibleEnvs.map((env) => (
                <UnstableTableHead
                  key={env.slug}
                  className="w-32 max-w-32 border-r border-b-0 text-center shadow-[inset_0_-1px_0_var(--color-border)] last:border-r-0"
                  isTruncatable
                >
                  {env.name}
                </UnstableTableHead>
              ))}
            </UnstableTableRow>
          </UnstableTableHeader>
          <UnstableTableBody>
            {selectedResources.map((item) => (
              <UnstableTableRow key={item.name} className="group">
                <UnstableTableCell className="sticky left-0 z-10 bg-container transition-colors duration-75 group-hover:bg-container-hover">
                  <KeyIcon className="size-4 text-secret" />
                </UnstableTableCell>
                <UnstableTableCell
                  className="sticky left-10 z-10 max-w-80 bg-container shadow-[inset_-1px_0_0_var(--color-border)] transition-colors duration-75 group-hover:bg-container-hover"
                  isTruncatable
                >
                  {item.name}
                </UnstableTableCell>
                {visibleEnvs.map((env) => (
                  <UnstableTableCell
                    key={env.slug}
                    className="border-r text-center last:border-r-0"
                  >
                    {item.envSlugs.has(env.slug) ? (
                      <TagsIcon className="inline-block size-4 text-project" />
                    ) : (
                      <span className="text-muted">&mdash;</span>
                    )}
                  </UnstableTableCell>
                ))}
              </UnstableTableRow>
            ))}
          </UnstableTableBody>
        </UnstableTable>
      )}

      <div className="flex flex-col gap-4 py-4">
        <Field>
          <FieldLabel>Tags</FieldLabel>
          <FieldContent>
            <Controller
              name="tags"
              control={control}
              render={({ field }) => (
                <CreatableSelect
                  isMulti
                  noOptionsMessage={({ inputValue }) =>
                    inputValue && !slugSchema().safeParse(inputValue).success
                      ? "Tag must be slug-friendly"
                      : "No tags match search"
                  }
                  isLoading={isTagsLoading}
                  placeholder="Select or create tags..."
                  options={tagOptions}
                  value={field.value}
                  onChange={(newValue) => field.onChange(newValue)}
                  onCreateOption={handleCreateTag}
                  isValidNewOption={(inputValue) =>
                    !canAddTags
                      ? false
                      : slugSchema().safeParse(inputValue).success &&
                        !projectTags?.map((tag) => tag.slug).includes(inputValue)
                  }
                />
              )}
            />
          </FieldContent>
        </Field>
        <Field>
          <div className="flex items-center gap-3">
            <Controller
              name="isReplaceMode"
              control={control}
              render={({ field }) => (
                <Switch
                  variant="project"
                  id="replace-tags-toggle"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <FieldLabel htmlFor="replace-tags-toggle" className="mb-0 cursor-pointer">
              Replace existing tags
            </FieldLabel>
          </div>
          <FieldDescription>
            {isReplaceMode
              ? "All existing tags on selected secrets will be removed and replaced with the tags selected above."
              : "Selected tags will be added to each secret, keeping any existing tags."}
          </FieldDescription>
        </Field>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button type="submit" variant="project" isPending={isSubmitting} isDisabled={!isValid}>
          Apply Tags
        </Button>
      </DialogFooter>
    </form>
  );
};

export const BulkTagDialog = ({ isOpen, onOpenChange, ...contentProps }: Props) => {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      {isOpen && (
        <DialogContent className="max-w-7xl">
          <BulkTagDialogContent {...contentProps} onClose={() => onOpenChange(false)} />
        </DialogContent>
      )}
    </Dialog>
  );
};
