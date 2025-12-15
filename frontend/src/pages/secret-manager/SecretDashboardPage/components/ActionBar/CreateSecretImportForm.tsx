import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AxiosError } from "axios";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
  Modal,
  ModalContent,
  Select,
  SelectItem
} from "@app/components/v2";
import { SecretPathInput } from "@app/components/v2/SecretPathInput";
import { useProject, useSubscription } from "@app/context";
import { useCreateSecretImport } from "@app/hooks/api";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";

const typeSchema = z.object({
  environment: z.object({ name: z.string(), slug: z.string() }),
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
  projectId: string;
  secretPath?: string;
  // modal props
  isOpen?: boolean;
  onClose: () => void;
  onTogglePopUp: (isOpen: boolean) => void;
  onUpgradePlan: () => void;
};

export const CreateSecretImportForm = ({
  environment,
  projectId,
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
  const { currentProject } = useProject();
  const environments = currentProject?.environments || [];
  const selectedEnvironment = watch("environment");
  const { subscription } = useSubscription();

  const { mutateAsync: createSecretImport } = useCreateSecretImport();

  const handleFormSubmit = async ({
    environment: importedEnv,
    secretPath: importedSecPath,
    isReplication
  }: TFormSchema) => {
    try {
      if (
        isReplication &&
        !subscription?.get(SubscriptionProductCategory.SecretManager, "secretApproval")
      ) {
        onUpgradePlan();
        return;
      }

      await createSecretImport({
        environment,
        projectId,
        path: secretPath,
        isReplication,
        import: {
          environment: importedEnv.slug,
          path: importedSecPath
        }
      });
      onClose();
      reset();
      createNotification({
        type: "success",
        text: `Successfully linked. ${
          isReplication ? "Please refresh the dashboard to view changes" : ""
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
      }
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onTogglePopUp}>
      <ModalContent
        bodyClassName="overflow-visible"
        title="Add Secret Link"
        subTitle="To inherit secrets from another environment or folder"
      >
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <Controller
            control={control}
            name="environment"
            render={({ field: { onChange, value }, fieldState: { error } }) => (
              <FormControl label="Environment" errorText={error?.message} isError={Boolean(error)}>
                <FilterableSelect
                  options={environments}
                  getOptionLabel={(option) => option.name}
                  getOptionValue={(option) => option.slug}
                  placeholder="Select environment..."
                  value={value}
                  onChange={onChange}
                />
              </FormControl>
            )}
          />
          <Controller
            control={control}
            name="secretPath"
            defaultValue="/"
            render={({ field, fieldState: { error } }) => (
              <FormControl label="Secret Path" isError={Boolean(error)} errorText={error?.message}>
                <SecretPathInput {...field} environment={selectedEnvironment?.slug} />
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
                    ? "Secrets from the source will be automatically sent to the destination. If approval policies exist at the destination, the secrets will be sent as approval requests instead of being applied immediately."
                    : "Secrets from the source location will be imported to the selected destination immediately, ignoring any approval policies at the destination."
                }
              >
                <Select
                  value={value ? "true" : "false"}
                  onValueChange={(val) => onChange(val === "true")}
                  className="w-full border border-mineshaft-500"
                >
                  <SelectItem value="false">Ignore secret approval policies</SelectItem>
                  <SelectItem value="true">Respect secret approval policies</SelectItem>
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
