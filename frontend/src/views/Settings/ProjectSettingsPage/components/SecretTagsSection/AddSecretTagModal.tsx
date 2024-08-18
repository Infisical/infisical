import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import slugify from "@sindresorhus/slugify";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalClose, ModalContent } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useCreateWsTag } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const schema = z.object({
  slug: z.string().refine((v) => slugify(v) === v, {
    message: "Invalid slug. Slug can only contain alphanumeric characters and hyphens."
  })
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
  const { currentWorkspace } = useWorkspace();
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
    try {
      if (!currentWorkspace?.id) return;

      await createWsTag.mutateAsync({
        workspaceID: currentWorkspace?.id,
        tagSlug: slug,
        tagColor: ""
      });

      handlePopUpClose("CreateSecretTag");

      createNotification({
        text: "Successfully created a tag",
        type: "success"
      });
      reset();
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to create a tag",
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.CreateSecretTag?.isOpen}
      onOpenChange={(open) => {
        handlePopUpToggle("CreateSecretTag", open);
        reset();
      }}
    >
      <ModalContent
        title={`Add a tag for ${currentWorkspace?.name ?? ""}`}
        subTitle="Specify your tag name, and the slug will be created automatically."
      >
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            name="slug"
            defaultValue=""
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Tag Slug" isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} placeholder="Type your tag slug" />
              </FormControl>
            )}
          />
          <div className="mt-8 flex items-center">
            <Button
              className="mr-4"
              type="submit"
              isDisabled={isSubmitting}
              isLoading={isSubmitting}
            >
              Create
            </Button>
            <ModalClose asChild>
              <Button variant="plain" colorSchema="secondary">
                Cancel
              </Button>
            </ModalClose>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
