import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosError } from "axios";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FormControl,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { SecretPathInput } from "@app/components/v2/SecretPathInput";
import { useSubscription, useWorkspace } from "@app/context";
import { useCreateSecretImport } from "@app/hooks/api";

const typeSchema = z.object({
  environment: z.string().trim(),
  secretPath: z
    .string()
    .trim()
    .transform((val) =>
      typeof val === "string" && val.at(-1) === "/" && val.length > 1 ? val.slice(0, -1) : val
    ),
  isReplication: z.boolean().default(false)
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
  onUpgradePlan: () => void;
};

export const CreateSecretImportForm = ({
  environment,
  workspaceId,
  secretPath = "/",
  isOpen,
  onClose,
  onTogglePopUp,
  onUpgradePlan
}: Props) => {
  const {
    handleSubmit,
    control,
    reset,
    watch,
    formState: { isSubmitting }
  } = useForm<TFormSchema>({ resolver: zodResolver(typeSchema) });
  const { currentWorkspace } = useWorkspace();
  const environments = currentWorkspace?.environments || [];
  const selectedEnvironment = watch("environment");
  const { subscription } = useSubscription();

  const { mutateAsync: createSecretImport } = useCreateSecretImport();

  const handleFormSubmit = async ({
    environment: importedEnv,
    secretPath: importedSecPath,
    isReplication
  }: TFormSchema) => {
    try {
      if (isReplication && !subscription?.secretReplication) {
        onUpgradePlan();
        return;
      }

      await createSecretImport({
        environment,
        projectId: workspaceId,
        path: secretPath,
        isReplication,
        import: {
          environment: importedEnv,
          path: importedSecPath
        }
      });
      onClose();
      reset();
      createNotification({
        type: "success",
        text: `Successfully linked. ${isReplication ? "Please refresh the dashboard to view changes" : ""
          }`
      });
    } catch (err) {
      console.error(err);
      const axiosError = err as AxiosError;
      if (axiosError?.response?.status === 401) {
        createNotification({
          text: "You do not have access to the selected environment/path",
          type: "error"
        });
      } else {
        createNotification({
          type: "error",
          text: "Failed to link secrets"
        });
      }
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
                <SecretPathInput {...field} environment={selectedEnvironment} />
              </FormControl>
            )}
          />
          <Controller
            name="isReplication"
            control={control}
            defaultValue={false}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                isError={Boolean(error?.message)}
                errorText={error?.message}
                helperText={
                  value
                    ? "Manual control over when updates propagate in approval mode, giving you the flexibility to push changes as needed."
                    : "Instantaneous updates from the linked source on approval mode, ensuring real-time synchronization."
                }
              >
                <Select
                  value={value ? "true" : "false"}
                  onValueChange={(val) => onChange(val === "true")}
                  className="w-full border border-mineshaft-500"
                >
                  <SelectItem value="false">Linked Mode</SelectItem>
                  <SelectItem value="true">Replication Mode</SelectItem>
                </Select>
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
