import { Controller, useForm } from "react-hook-form";
import { faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Checkbox,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalContent,
  Tooltip
} from "@app/components/v2";
import { InfisicalSecretInput } from "@app/components/v2/InfisicalSecretInput";
import { useWorkspace } from "@app/context";
import { useCreateFolder, useCreateSecretV3, useUpdateSecretV3 } from "@app/hooks/api";
import { SecretType,SecretV3RawSanitized } from "@app/hooks/api/types";

const typeSchema = z
  .object({
    key: z.string().trim().min(1, "Key is required"),
    value: z.string().optional(),
    environments: z.record(z.boolean().optional())
  })
  .refine((data) => data.key !== undefined, {
    message: "Please enter secret name"
  });

type TFormSchema = z.infer<typeof typeSchema>;

type Props = {
  secretPath?: string;
  getSecretByKey: (slug: string, key: string) => SecretV3RawSanitized | undefined;
  // modal props
  isOpen?: boolean;
  onClose: () => void;
  onTogglePopUp: (isOpen: boolean) => void;
};

export const CreateSecretForm = ({
  secretPath = "/",
  isOpen,
  getSecretByKey,
  onClose,
  onTogglePopUp
}: Props) => {
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { isSubmitting, errors }
  } = useForm<TFormSchema>({ resolver: zodResolver(typeSchema) });
  const newSecretKey = watch("key");

  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || "";
  const environments = currentWorkspace?.environments || [];

  const { mutateAsync: createSecretV3 } = useCreateSecretV3();
  const { mutateAsync: updateSecretV3 } = useUpdateSecretV3();
  const { mutateAsync: createFolder } = useCreateFolder();

  const handleFormSubmit = async ({ key, value, environments: selectedEnv }: TFormSchema) => {
    const environmentsSelected = environments.filter(({ slug }) => selectedEnv[slug]);
    const isEnvironmentsSelected = environmentsSelected.length;

    if (!isEnvironmentsSelected) {
      createNotification({ type: "error", text: "Select at least one environment" });
      return;
    }

    const promises = environmentsSelected.map(async (env) => {
      const environment = env.slug;
      // create folder if not existing
      if (secretPath !== "/") {
        // /hello/world -> [hello","world"]
        const pathSegment = secretPath.split("/").filter(Boolean);
        const parentPath = `/${pathSegment.slice(0, -1).join("/")}`;
        const folderName = pathSegment.at(-1);
        if (folderName && parentPath) {
          await createFolder({
            projectId: workspaceId,
            path: parentPath,
            environment,
            name: folderName
          });
        }
      }

      const isEdit = getSecretByKey(environment, key) !== undefined;
      if (isEdit) {
        return updateSecretV3({
          environment,
          workspaceId,
          secretPath,
          secretKey: key,
          secretValue: value || "",
          type: SecretType.Shared
        });
      }

      return createSecretV3({
        environment,
        workspaceId,
        secretPath,
        secretKey: key,
        secretValue: value || "",
        secretComment: "",
        type: SecretType.Shared
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
        title="Bulk Create & Update"
        subTitle="Create & update a secret across many environments"
      >
        <form onSubmit={handleSubmit(handleFormSubmit)} noValidate>
          <FormControl label="Key" isRequired isError={Boolean(errors?.key)} errorText={errors?.key?.message}>
            <Input
              {...register("key")}
              placeholder="Type your secret name"
              autoCapitalization={currentWorkspace?.autoCapitalization}
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
                  containerClassName="text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-mineshaft-900 px-2 py-1.5"
                />
              </FormControl>
            )}
          />
          <FormLabel label="Environments" className="mb-2" />
          <div className="thin-scrollbar grid max-h-64 grid-cols-3 gap-4 overflow-auto py-2">
            {environments.map((env) => {
              return (
                <Controller
                  name={`environments.${env.slug}`}
                  key={`secret-input-${env.slug}`}
                  control={control}
                  render={({ field }) => (
                    <Checkbox
                      isChecked={field.value}
                      onCheckedChange={field.onChange}
                      id={`secret-input-${env.slug}`}
                      className="!justify-start"
                    >
                      <span className="flex w-full flex-row items-center justify-start whitespace-pre-wrap">
                        <span title={env.name} className="truncate">
                          {env.name}
                        </span>
                        <span>
                          {getSecretByKey(env.slug, newSecretKey) && (
                            <Tooltip
                              className="max-w-[150px]"
                              content="Secret already exists, and it will be overwritten"
                            >
                              <FontAwesomeIcon icon={faWarning} className="ml-1 text-yellow-400" />
                            </Tooltip>
                          )}
                        </span>
                      </span>
                    </Checkbox>
                  )}
                />
              );
            })}
          </div>
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
