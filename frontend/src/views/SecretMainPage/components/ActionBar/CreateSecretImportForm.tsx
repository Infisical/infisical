import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useCreateSecretImport } from "@app/hooks/api";

const typeSchema = z.object({
  environment: z.string().trim(),
  secretPath: z
    .string()
    .trim()
    .transform((val) =>
      typeof val === "string" && val.at(-1) === "/" && val.length > 1 ? val.slice(0, -1) : val
    )
});

type TFormSchema = z.infer<typeof typeSchema>;

type Props = {
  environment: string;
  workspaceId: string;
  secretPath?: string;
  // modal props
  isOpen?: boolean;
  onClose: () => void;
  onTogglePopUp: (isOpen: boolean) => void;
};

export const CreateSecretImportForm = ({
  environment,
  workspaceId,
  secretPath = "/",
  isOpen,
  onClose,
  onTogglePopUp
}: Props) => {
  const {
    handleSubmit,
    control,
    reset,
    formState: { isSubmitting }
  } = useForm<TFormSchema>({ resolver: zodResolver(typeSchema) });
  const { currentWorkspace } = useWorkspace();
  const environments = currentWorkspace?.environments || [];

  const { createNotification } = useNotificationContext();

  const { mutateAsync: createSecretImport } = useCreateSecretImport();

  const handleFormSubmit = async ({
    environment: importedEnv,
    secretPath: importedSecPath
  }: TFormSchema) => {
    try {
      await createSecretImport({
        environment,
        workspaceId,
        directory: secretPath,
        secretImport: {
          environment: importedEnv,
          secretPath: importedSecPath
        }
      });
      onClose();
      reset();
      createNotification({
        type: "success",
        text: "Successfully linked"
      });
    } catch (error) {
      console.log(error);
      createNotification({
        type: "error",
        text: "Failed to link secrets"
      });
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onTogglePopUp}>
      <ModalContent
        title="Add Secret Link"
        subTitle="To inherit secrets from another environment or folder"
      >
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <Controller
            control={control}
            name="environment"
            defaultValue={environments?.[0]?.slug}
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl label="Environment" errorText={error?.message} isError={Boolean(error)}>
                <Select
                  defaultValue={field.value}
                  {...field}
                  onValueChange={(e) => onChange(e)}
                  className="w-full"
                >
                  {environments.map(({ name, slug }) => (
                    <SelectItem value={slug} key={slug}>
                      {name}
                    </SelectItem>
                  ))}
                </Select>
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="secretPath"
            defaultValue="/"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Secret Path" isError={Boolean(error)} errorText={error?.message}>
                <Input {...field} />
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
              Create Link
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
