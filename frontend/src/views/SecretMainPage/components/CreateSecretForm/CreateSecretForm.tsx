import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Button, FormControl, Input, Modal, ModalContent, SecretInput } from "@app/components/v2";
import { useCreateSecretV3 } from "@app/hooks/api";
import { UserWsKeyPair } from "@app/hooks/api/types";

import { PopUpNames, usePopUpAction, usePopUpState } from "../../SecretMainPage.store";

const typeSchema = z.object({
  key: z.string(),
  value: z.string().optional()
});

type TFormSchema = z.infer<typeof typeSchema>;

type Props = {
  environment: string;
  workspaceId: string;
  decryptFileKey: UserWsKeyPair;
  secretPath?: string;
  // modal props
  autoCapitalize?: boolean;
  isProtectedBranch?: boolean;
};

export const CreateSecretForm = ({
  environment,
  workspaceId,
  decryptFileKey,
  secretPath = "/",
  autoCapitalize = true,
  isProtectedBranch = false
}: Props) => {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<TFormSchema>({ resolver: zodResolver(typeSchema) });
  const { isOpen } = usePopUpState(PopUpNames.CreateSecretForm);
  const { closePopUp, togglePopUp } = usePopUpAction();

  const { createNotification } = useNotificationContext();

  const { mutateAsync: createSecretV3 } = useCreateSecretV3();

  const handleFormSubmit = async ({ key, value }: TFormSchema) => {
    try {
      await createSecretV3({
        environment,
        workspaceId,
        secretPath,
        secretName: key,
        secretValue: value || "",
        secretComment: "",
        type: "shared",
        latestFileKey: decryptFileKey
      });
      closePopUp(PopUpNames.CreateSecretForm);
      reset();
      createNotification({
        type: "success",
        text: isProtectedBranch
          ? "Requested changes have been sent for review"
          : "Successfully created secret"
      });
    } catch (error) {
      console.log(error);
      createNotification({
        type: "error",
        text: "Failed to create secret"
      });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(state) => togglePopUp(PopUpNames.CreateSecretForm, state)}
    >
      <ModalContent
        title="Create secret"
        subTitle="Add a secret to the particular environment and folder"
      >
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <FormControl label="Key" isError={Boolean(errors?.key)} errorText={errors?.key?.message}>
            <Input
              {...register("key")}
              placeholder="Type your secret name"
              autoCapitalization={autoCapitalize}
            />
          </FormControl>
          <Controller
            control={control}
            name="value"
            render={({ field }) => (
              <FormControl
                label="Value"
                isError={Boolean(errors?.value)}
                errorText={errors?.value?.message}
              >
                <SecretInput
                  {...field}
                  containerClassName="text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-mineshaft-900 px-2 py-1.5"
                />
              </FormControl>
            )}
          />
          <div className="mt-7 flex items-center">
            <Button
              isDisabled={isSubmitting}
              isLoading={isSubmitting}
              key="layout-create-project-submit"
              className="mr-4"
              type="submit"
            >
              Create Secret
            </Button>
            <Button
              key="layout-cancel-create-project"
              onClick={() => closePopUp(PopUpNames.CreateSecretForm)}
              variant="plain"
              colorSchema="secondary"
            >
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
