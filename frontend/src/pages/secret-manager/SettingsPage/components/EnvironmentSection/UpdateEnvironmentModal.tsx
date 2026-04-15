import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent, Switch } from "@app/components/v2";
import { useProject } from "@app/context";
import { useUpdateWsEnvironment } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { slugSchema } from "@app/lib/schemas";

type Props = {
  popUp: UsePopUpState<["updateEnv"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["updateEnv"]>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["updateEnv"]>, state?: boolean) => void;
};

const schema = z.object({
  name: z.string(),
  slug: slugSchema({ min: 1, max: 64 }),
  allowSecretExport: z.boolean().default(true)
});

export type FormData = z.infer<typeof schema>;

export const UpdateEnvironmentModal = ({ popUp, handlePopUpClose, handlePopUpToggle }: Props) => {
  const { currentProject } = useProject();
  const { mutateAsync, isPending } = useUpdateWsEnvironment();
  const { control, handleSubmit, reset } = useForm<FormData>({
    resolver: zodResolver(schema),
    values: popUp.updateEnv.data as FormData
  });

  const oldEnvId = (popUp?.updateEnv?.data as { id: string })?.id;

  const onFormSubmit = async ({ name, slug, allowSecretExport }: FormData) => {
    if (!currentProject?.id) return;

    await mutateAsync({
      projectId: currentProject.id,
      name,
      slug,
      allowSecretExport,
      id: oldEnvId
    });

    createNotification({
      text: "Successfully updated environment",
      type: "success"
    });

    handlePopUpClose("updateEnv");
  };

  return (
    <Modal
      isOpen={popUp?.updateEnv?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("updateEnv", isOpen);
        reset();
      }}
    >
      <ModalContent title="Update environment">
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            defaultValue=""
            name="name"
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
            name="slug"
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
          <Controller
            control={control}
            name="allowSecretExport"
            render={({ field }) => (
              <div className="mt-4 flex items-center justify-between rounded-md border border-mineshaft-600 bg-mineshaft-700 p-4">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-mineshaft-100">
                    Allow Secret Export
                  </span>
                  <span className="text-xs text-mineshaft-400">
                    When disabled, users cannot download or export secrets as .env files from this
                    environment.
                  </span>
                </div>
                <Switch
                  id="allow-secret-export"
                  isChecked={field.value}
                  onCheckedChange={field.onChange}
                />
              </div>
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
              Update
            </Button>

            <Button
              onClick={() => handlePopUpClose("updateEnv")}
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
