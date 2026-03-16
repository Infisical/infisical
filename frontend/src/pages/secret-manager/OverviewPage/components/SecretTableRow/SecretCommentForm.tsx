import { useEffect, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { subject } from "@casl/ability";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, TextArea } from "@app/components/v3";
import { ProjectPermissionSub, useProject, useProjectPermission } from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
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
  isBatchMode?: boolean;
  onCommentChange?: (comment: string) => void;
};

export const SecretCommentForm = ({
  comment,
  secretKey,
  environment,
  secretPath,
  onClose,
  isBatchMode,
  onCommentChange
}: Props) => {
  const { projectId } = useProject();
  const { permission } = useProjectPermission();
  const { mutateAsync: updateSecretV3, isPending } = useUpdateSecretV3();

  const canEdit = permission.can(
    ProjectPermissionSecretActions.Edit,
    subject(ProjectPermissionSub.Secrets, {
      environment,
      secretPath,
      secretName: secretKey,
      secretTags: ["*"]
    })
  );

  const {
    handleSubmit,
    control,
    reset,
    watch,
    formState: { isDirty }
  } = useForm<TFormSchema>({
    defaultValues: { comment: comment ?? "" },
    resolver: zodResolver(formSchema)
  });

  // In batch mode, debounce comment changes to parent form
  const watchedComment = watch("comment");
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!isBatchMode) return () => {};

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      onCommentChange?.(watchedComment);
    }, 500);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [isBatchMode, watchedComment, onCommentChange]);

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
    onClose?.();
  };

  if (!canEdit) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">Comment</p>
        <p className="max-h-48 min-h-24 thin-scrollbar overflow-y-auto rounded-md border border-border px-3 py-2 text-sm break-words whitespace-pre-wrap opacity-100">
          {comment}
        </p>
        <div className="flex justify-end">
          <Button variant="ghost" size="xs" type="button" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  if (isBatchMode) {
    return (
      <div className="space-y-3">
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
        <div className="flex justify-end">
          <Button variant="ghost" size="xs" type="button" onClick={onClose}>
            Close
          </Button>
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
