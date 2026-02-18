import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, TextArea, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { useUpdateSecretV3 } from "@app/hooks/api";
import { SecretType } from "@app/hooks/api/types";

const formSchema = z.object({
  comment: z.string()
});

type TFormSchema = z.infer<typeof formSchema>;

type Props = {
  comment?: string;
  secretKey: string;
  environment: string;
  secretPath: string;
  onClose?: () => void;
};

export const SecretCommentForm = ({
  comment,
  secretKey,
  environment,
  secretPath,
  onClose
}: Props) => {
  const [isEditing, setIsEditing] = useState(Boolean(!comment));
  const { projectId } = useProject();
  const { mutateAsync: updateSecretV3, isPending } = useUpdateSecretV3();

  const {
    handleSubmit,
    control,
    reset,
    formState: { isDirty }
  } = useForm<TFormSchema>({
    defaultValues: { comment: comment ?? "" },
    resolver: zodResolver(formSchema)
  });

  const onSubmit = async (data: TFormSchema) => {
    const result = await updateSecretV3({
      environment,
      projectId,
      secretPath,
      secretKey,
      type: SecretType.Shared,
      secretComment: data.comment
    });

    if ("approval" in result) {
      createNotification({
        type: "info",
        text: "Requested change has been sent for review"
      });
    } else {
      createNotification({
        type: "success",
        text: "Successfully updated secret"
      });
    }
    onClose?.();
  };

  const handleCancel = () => {
    reset();
    setIsEditing(false);
  };

  if (!isEditing) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">Comment</p>

        <p className="max-h-48 min-h-24 thin-scrollbar overflow-y-auto rounded-md border border-border px-3 py-2 text-sm break-words whitespace-pre-wrap opacity-100">
          {comment}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="xs" type="button" onClick={onClose}>
            Close
          </Button>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Edit}
            a={subject(ProjectPermissionSub.Secrets, {
              environment,
              secretPath,
              secretName: secretKey,
              secretTags: ["*"]
            })}
          >
            {(isAllowed) => (
              <Tooltip open={isAllowed ? false : undefined}>
                <TooltipTrigger>
                  <Button
                    variant="project"
                    isDisabled={!isAllowed}
                    size="xs"
                    type="button"
                    onClick={() => setIsEditing(true)}
                  >
                    Edit Comment
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Access Denied</TooltipContent>
              </Tooltip>
            )}
          </ProjectPermissionCan>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <p className="text-sm font-medium">Comment</p>
      <Controller
        name="comment"
        control={control}
        render={({ field }) => (
          <TextArea
            {...field}
            autoFocus
            placeholder="Add a comment..."
            className="max-h-48 min-h-24 resize-none"
          />
        )}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="xs" type="button" onClick={handleCancel}>
          Cancel
        </Button>
        <Button
          variant="project"
          size="xs"
          type="submit"
          isDisabled={!isDirty || isPending}
          isPending={isPending}
        >
          Save Comment
        </Button>
      </div>
    </form>
  );
};
