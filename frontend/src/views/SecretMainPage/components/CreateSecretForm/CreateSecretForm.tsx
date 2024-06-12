import { Controller, useForm } from "react-hook-form";
import { faCircleQuestion } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Switch,
  Tooltip
} from "@app/components/v2";
import { InfisicalSecretInput } from "@app/components/v2/InfisicalSecretInput";
import { useCreateSecretV3 } from "@app/hooks/api";
import { UserWsKeyPair } from "@app/hooks/api/types";

import { PopUpNames, usePopUpAction, usePopUpState } from "../../SecretMainPage.store";

const typeSchema = z.object({
  key: z.string(),
  value: z.string().optional(),
  skipMultilineEncoding: z.boolean().optional()
});

type TFormSchema = z.infer<typeof typeSchema>;

type Props = {
  environment: string;
  workspaceId: string;
  decryptFileKey: UserWsKeyPair;
  secretPath?: string;
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
    watch,
    formState: { errors, isSubmitting }
  } = useForm<TFormSchema>({ resolver: zodResolver(typeSchema) });
  const { isOpen } = usePopUpState(PopUpNames.CreateSecretForm);
  const { closePopUp, togglePopUp } = usePopUpAction();
  const newSecretValue = watch("value");
  const isMultiline = newSecretValue?.includes("\n");

  const { mutateAsync: createSecretV3 } = useCreateSecretV3();

  const handleFormSubmit = async ({ key, value, skipMultilineEncoding }: TFormSchema) => {
    try {
      await createSecretV3({
        environment,
        workspaceId,
        secretPath,
        secretName: key,
        secretValue: value || "",
        secretComment: "",
        type: "shared",
        latestFileKey: decryptFileKey,
        skipMultilineEncoding
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
                <InfisicalSecretInput
                  {...field}
                  environment={environment}
                  secretPath={secretPath}
                  containerClassName="text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-mineshaft-900 px-2 py-1.5"
                />
              </FormControl>
            )}
          />
          {isMultiline && (
            <div className="my-2 mb-6 ml-1 border-b border-mineshaft-600 pb-4">
              <Controller
                control={control}
                name="skipMultilineEncoding"
                render={({ field: { value, onChange, onBlur } }) => (
                  <Switch
                    id="skipmultiencoding-option"
                    onCheckedChange={(isChecked) => onChange(!isChecked)}
                    isChecked={!value}
                    onBlur={onBlur}
                    className="items-center"
                  >
                    Enable multi line encoding
                    <Tooltip
                      content="When enabled, secrets are escaped and wrapped in quotes"
                      className="z-[100]"
                    >
                      <FontAwesomeIcon icon={faCircleQuestion} className="ml-1" size="sm" />
                    </Tooltip>
                  </Switch>
                )}
              />
            </div>
          )}
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
