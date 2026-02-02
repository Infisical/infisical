import { Controller, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, CreatableSelect } from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { useCreateWsTag, useGetWsTags, useUpdateSecretV3 } from "@app/hooks/api";
import { SecretType, WsTag } from "@app/hooks/api/types";
import { slugSchema } from "@app/lib/schemas";

const formSchema = z.object({
  tags: z.array(z.object({ label: z.string(), value: z.string() })).default([])
});

type TFormSchema = z.infer<typeof formSchema>;

type Props = {
  tags?: WsTag[];
  secretKey: string;
  environment: string;
  secretPath: string;
  isOverride?: boolean;
  onClose?: () => void;
};

export const SecretTagForm = ({
  tags,
  secretKey,
  environment,
  secretPath,
  isOverride,
  onClose
}: Props) => {
  const { projectId } = useProject();
  const { mutateAsync: updateSecretV3, isPending } = useUpdateSecretV3();
  const { mutateAsync: createWsTag } = useCreateWsTag();

  const { permission } = useProjectPermission();
  const canAddTags = permission.can(ProjectPermissionActions.Create, ProjectPermissionSub.Tags);
  const canEditSecret = permission.can(
    ProjectPermissionSecretActions.Edit,
    subject(ProjectPermissionSub.Secrets, {
      environment,
      secretPath,
      secretName: secretKey,
      secretTags: tags?.map((tag) => tag.slug) ?? ["*"]
    })
  );
  const { data: projectTags, isPending: isTagsLoading } = useGetWsTags(projectId);

  const {
    handleSubmit,
    control,
    setValue,
    getValues,
    formState: { isDirty }
  } = useForm<TFormSchema>({
    defaultValues: {
      tags: tags?.map((tag) => ({ label: tag.slug, value: tag.id })) ?? []
    },
    resolver: zodResolver(formSchema)
  });

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
      shouldDirty: true
    });
  };

  const onSubmit = async (data: TFormSchema) => {
    const result = await updateSecretV3({
      environment,
      projectId,
      secretPath,
      secretKey,
      type: isOverride ? SecretType.Personal : SecretType.Shared,
      tagIds: data.tags.map((tag) => tag.value)
    });

    if ("approval" in result) {
      createNotification({
        type: "info",
        text: "Requested change has been sent for review"
      });
    } else {
      createNotification({
        type: "success",
        text: "Successfully updated tags"
      });
    }
    onClose?.();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <p className="text-sm font-medium">Tags</p>
      <Controller
        name="tags"
        control={control}
        render={({ field }) => (
          <CreatableSelect
            menuPlacement="top"
            isMulti
            noOptionsMessage={({ inputValue }) =>
              inputValue && !slugSchema().safeParse(inputValue)
                ? "Tag must be slug-friendly"
                : "No tags match search"
            }
            isDisabled={!canEditSecret}
            isLoading={isTagsLoading}
            placeholder="Select or create tags..."
            options={projectTags?.map((tag) => ({ label: tag.slug, value: tag.id }))}
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
      {!canEditSecret && (
        <p className="text-xs text-muted">
          You do not have permission to edit tags on this secret.
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="xs" type="button" onClick={onClose}>
          Close
        </Button>
        {canEditSecret && (
          <Button
            variant="project"
            size="xs"
            type="submit"
            isDisabled={!isDirty || isPending}
            isPending={isPending}
          >
            Save Tags
          </Button>
        )}
      </div>
    </form>
  );
};
