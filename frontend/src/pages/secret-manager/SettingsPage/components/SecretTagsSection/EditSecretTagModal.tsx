import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  ColorPicker,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useUpdateWsTag } from "@app/hooks/api";
import { WsTag } from "@app/hooks/api/tags/types";
import { slugSchema } from "@app/lib/schemas";

const schema = z.object({
  slug: slugSchema({ min: 1, max: 64, field: "Tag Slug" }),
  color: z.string().trim()
});

type FormData = z.infer<typeof schema>;

type Props = {
  tag?: WsTag;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const EditSecretTagModal = ({ tag, isOpen, onOpenChange }: Props) => {
  const { currentProject } = useProject();
  const updateWsTag = useUpdateWsTag();
  const {
    control,
    reset,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (isOpen && tag) reset({ slug: tag.slug, color: tag.color ?? "" });
  }, [isOpen, reset, tag]);

  const onFormSubmit = async ({ slug, color }: FormData) => {
    if (!currentProject?.id || !tag) return;

    await updateWsTag.mutateAsync({
      projectId: currentProject.id,
      tagID: tag.id,
      tagSlug: slug,
      tagColor: color
    });

    onOpenChange(false);
    createNotification({ text: "Successfully updated tag", type: "success" });
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Tag</DialogTitle>
          <DialogDescription>Update the tag slug or color for this project.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-6">
          <Controller
            control={control}
            name="slug"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="edit-tag-slug">Tag Slug</FieldLabel>
                <Input
                  id="edit-tag-slug"
                  placeholder="Type your tag slug"
                  isError={Boolean(error)}
                  {...field}
                />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="color"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Tag Color</FieldLabel>
                <ColorPicker {...field} isError={Boolean(error)} />
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant="project"
              isPending={isSubmitting}
              isDisabled={isSubmitting || !tag}
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
