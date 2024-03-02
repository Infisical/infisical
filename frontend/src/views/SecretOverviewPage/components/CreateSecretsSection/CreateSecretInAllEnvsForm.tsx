import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Button, FormControl, Input, Modal, ModalContent, SecretInput } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useCreateSecretV3 } from "@app/hooks/api";
import { UserWsKeyPair } from "@app/hooks/api/types";

const typeSchema = z
  .object({
    key: z.string(),
    values: z.record(z.string().optional())
  })
  .refine((data) => data.key !== undefined, {
    message: "Please enter secret name"
  });

type TFormSchema = z.infer<typeof typeSchema>;

type Props = {
  workspaceId: string;
  secretPath?: string;
  decryptFileKey: UserWsKeyPair;

  // modal props
  isOpen?: boolean;
  onClose: () => void;
  onTogglePopUp: (isOpen: boolean) => void;
};

export const CreateSecretInAllEnvsForm = ({
  workspaceId,
  secretPath = "/",
  decryptFileKey,
  isOpen,
  onClose,
  onTogglePopUp
}: Props) => {
  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    formState: { isSubmitting, errors }
  } = useForm<TFormSchema>({ resolver: zodResolver(typeSchema) });
  const { currentWorkspace } = useWorkspace();
  const environments = currentWorkspace?.environments || [];

  const { createNotification } = useNotificationContext();

  const { mutateAsync: createSecretV3 } = useCreateSecretV3();

  const handleFormSubmit = async ({ key, values }: TFormSchema) => {
    if (!key) {
      setError("key", { message: "Please enter secret name" });
      return;
    }

    const promises = environments.map((env) => {
      const environment = env.slug;
      const value = values[environment] || "";

      return createSecretV3({
        environment,
        workspaceId,
        secretPath,
        secretName: key,
        secretValue: value,
        secretComment: "",
        type: "shared",
        latestFileKey: decryptFileKey
      });
    });

    const results = await Promise.allSettled(promises);
    const isSecretsAdded = results.some((result) => result.status === "fulfilled");

    if (isSecretsAdded) {
      createNotification({
        type: "success",
        text: "Secrets created successfully"
      });
      onClose();
      reset();
    } else {
      createNotification({
        type: "error",
        text: "Failed to create secrets"
      });
    }
  };
  return (
    <Modal isOpen={isOpen} onOpenChange={onTogglePopUp}>
      <ModalContent
        className="max-h-[80vh] overflow-y-auto"
        title="Add Secrets"
        subTitle="Add secrets in all environments at once."
      >
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <FormControl label="Key" isError={Boolean(errors?.key)} errorText={errors?.key?.message}>
            <Input
              {...register("key")}
              placeholder="Type your secret name"
              autoCapitalization={currentWorkspace?.autoCapitalization}
            />
          </FormControl>

          {environments.map((env) => {
            return (
              <Controller
                key={`secret-input-${env.slug}`}
                control={control}
                name={`values.${env.slug}`}
                render={({ field }) => (
                  <FormControl
                    label={`${env.name} Value`}
                    isError={Boolean(errors?.values?.[env.slug])}
                    errorText={errors?.values?.[env.slug]?.message}
                  >
                    <SecretInput
                      {...field}
                      containerClassName="text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-mineshaft-900 px-2 py-1.5"
                    />
                  </FormControl>
                )}
              />
            );
          })}

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
              onClick={onClose}
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
