import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useCreateWsEnvironment } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { slugSchema } from "@app/lib/schemas";

type Props = {
  popUp: UsePopUpState<["createEnv"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["createEnv"]>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["createEnv"]>, state?: boolean) => void;
};

const schema = z.object({
  environmentName: z
    .string()
    .min(1, { message: "Environment Name field must be at least 1 character" }),
  environmentSlug: slugSchema({ max: 64 })
});

export type FormData = z.infer<typeof schema>;

export const AddEnvironmentModal = ({ popUp, handlePopUpClose, handlePopUpToggle }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const { mutateAsync, isPending } = useCreateWsEnvironment();
  const { control, handleSubmit, reset } = useForm<FormData>({
    resolver: zodResolver(schema)
  });

  const onFormSubmit = async ({ environmentName, environmentSlug }: FormData) => {
    try {
      if (!currentWorkspace?.id) return;

      await mutateAsync({
        workspaceId: currentWorkspace.id,
        name: environmentName,
        slug: environmentSlug
      });

      createNotification({
        text: "Successfully created environment",
        type: "success"
      });

      handlePopUpClose("createEnv");
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to create environment",
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.createEnv?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("createEnv", isOpen);
        reset();
      }}
    >
      <ModalContent title="Create a new environment">
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            defaultValue=""
            name="environmentName"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Environment Name"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            defaultValue=""
            name="environmentSlug"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Environment Slug"
                helperText="Slugs are shorthands used in cli to access environment"
                isError={Boolean(error)}
                errorText={error?.message}
              >
                <Input {...field} />
              </FormControl>
            )}
          />
          <div className="mt-8 flex items-center">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isPending}
              isDisabled={isPending}
            >
              Create
            </Button>

            <Button
              onClick={() => handlePopUpClose("createEnv")}
              colorSchema="secondary"
              variant="plain"
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
