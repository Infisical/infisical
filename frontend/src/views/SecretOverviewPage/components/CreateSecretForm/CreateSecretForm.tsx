import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { faCircleQuestion, faWarning } from "@fortawesome/free-solid-svg-icons";
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
  Switch,
  Tooltip
} from "@app/components/v2";
import { InfisicalSecretInput } from "@app/components/v2/InfisicalSecretInput";
import { useWorkspace } from "@app/context";
import { useCreateFolder, useCreateSecretV3, useUpdateSecretV3 } from "@app/hooks/api";
import { DecryptedSecret, UserWsKeyPair } from "@app/hooks/api/types";

const typeSchema = z
  .object({
    key: z.string().min(1, "Key is required"),
    value: z.string().optional(),
    skipMultilineEncoding: z.boolean().optional(),
    environments: z.record(z.boolean().optional())
  })
  .refine((data) => data.key !== undefined, {
    message: "Please enter secret name"
  });

type TFormSchema = z.infer<typeof typeSchema>;

type Props = {
  secretPath?: string;
  decryptFileKey: UserWsKeyPair;
  getSecretByKey: (slug: string, key: string) => DecryptedSecret | undefined;
  // modal props
  isOpen?: boolean;
  onClose: () => void;
  onTogglePopUp: (isOpen: boolean) => void;
};

export const CreateSecretForm = ({
  secretPath = "/",
  decryptFileKey,
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
  const newValue = watch("value");
  const [isMultiline, setIsMultiline] = useState(false);

  useEffect(() => {
    if (newValue) setIsMultiline(newValue.includes("\n"));
    else setIsMultiline(false);
  }, [newValue]);

  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || "";
  const environments = currentWorkspace?.environments || [];

  const { mutateAsync: createSecretV3 } = useCreateSecretV3();
  const { mutateAsync: updateSecretV3 } = useUpdateSecretV3();
  const { mutateAsync: createFolder } = useCreateFolder();

  const handleFormSubmit = async ({
    key,
    value,
    skipMultilineEncoding,
    environments: selectedEnv
  }: TFormSchema) => {
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
          secretName: key,
          secretValue: value || "",
          type: "shared",
          latestFileKey: decryptFileKey,
          skipMultilineEncoding
        });
      }

      return createSecretV3({
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
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <FormControl label="Key" isError={Boolean(errors?.key)} errorText={errors?.key?.message}>
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
