import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
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
import { useCreateWsTag } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { slugSchema } from "@app/lib/schemas";

const schema = z.object({
  slug: slugSchema({ min: 1, field: "Tag Slug" })
});

export type FormData = z.infer<typeof schema>;

type Props = {
  popUp: UsePopUpState<["CreateSecretTag", "deleteTagConfirmation"]>;
  handlePopUpClose: (
    popUpName: keyof UsePopUpState<["CreateSecretTag", "deleteTagConfirmation"]>
  ) => void;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["CreateSecretTag", "deleteTagConfirmation"]>,
    state?: boolean
  ) => void;
};

export const AddSecretTagModal = ({ popUp, handlePopUpClose, handlePopUpToggle }: Props) => {
  const { currentProject } = useProject();
  const createWsTag = useCreateWsTag();
  const {
    control,
    reset,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const onFormSubmit = async ({ slug }: FormData) => {
    if (!currentProject?.id) return;

    await createWsTag.mutateAsync({
      projectId: currentProject?.id,
      tagSlug: slug,
      tagColor: ""
    });

    handlePopUpClose("CreateSecretTag");

    createNotification({
      text: "Successfully created a tag",
      type: "success"
    });
    reset();
  };

  return (
    <Dialog
      open={popUp?.CreateSecretTag?.isOpen}
      onOpenChange={(open) => {
        handlePopUpToggle("CreateSecretTag", open);
        if (!open) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a Tag for {currentProject?.name ?? ""}</DialogTitle>
          <DialogDescription>
            Specify your tag name, and the slug will be created automatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onFormSubmit)} className="flex flex-col gap-6">
          <Controller
            control={control}
            name="slug"
            defaultValue=""
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel htmlFor="tagSlug">Tag Slug</FieldLabel>
                <Input
                  id="tagSlug"
                  placeholder="Type your tag slug"
                  isError={Boolean(error)}
                  {...field}
                />
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
              isDisabled={isSubmitting}
            >
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
