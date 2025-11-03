import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  FilterableSelect,
  FormControl,
  Input,
  Modal,
  ModalContent
} from "@app/components/v2";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { useListAppConnections } from "@app/hooks/api/appConnections/queries";
import {
  useCreateVaultExternalMigrationConfig,
  useUpdateVaultExternalMigrationConfig
} from "@app/hooks/api/migration";
import { TVaultExternalMigrationConfig } from "@app/hooks/api/migration/types";

const schema = z.object({
  namespace: z
    .string()
    .min(1, "Namespace is required. If you intend to use the root namespace, use root or /."),
  connectionId: z.string().min(1, "Connection is required")
});

type FormData = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  editConfig?: TVaultExternalMigrationConfig;
};

export const VaultNamespaceConfigModal = ({ isOpen, onOpenChange, editConfig }: Props) => {
  const isEdit = Boolean(editConfig);

  const { data: appConnections = [], isPending: isLoadingConnections } = useListAppConnections();

  const vaultConnections = useMemo(
    () => appConnections.filter((conn) => conn.app === AppConnection.HCVault),
    [appConnections]
  );

  const { mutateAsync: createConfig, isPending: isCreating } =
    useCreateVaultExternalMigrationConfig();
  const { mutateAsync: updateConfig, isPending: isUpdating } =
    useUpdateVaultExternalMigrationConfig();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      namespace: "",
      connectionId: ""
    }
  });

  // Reset form when editConfig changes or modal opens
  useEffect(() => {
    if (isOpen) {
      reset({
        namespace: editConfig?.namespace || "",
        connectionId: editConfig?.connectionId || ""
      });
    }
  }, [isOpen, editConfig, reset]);

  const onFormSubmit = async (data: FormData) => {
    if (isEdit && editConfig) {
      await updateConfig({
        id: editConfig.id,
        namespace: data.namespace,
        connectionId: data.connectionId
      });
      createNotification({
        type: "success",
        text: "Namespace configuration updated successfully"
      });
    } else {
      await createConfig({
        namespace: data.namespace,
        connectionId: data.connectionId
      });
      createNotification({
        type: "success",
        text: "Namespace configuration created successfully"
      });
    }
    reset();
    onOpenChange(false);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={handleClose}>
      <ModalContent
        title={isEdit ? "Edit Namespace Configuration" : "Add Namespace Configuration"}
        subTitle={`Configure a HashiCorp Vault namespace ${isEdit ? "configuration" : "for migration tooling"}`}
        bodyClassName="overflow-visible"
      >
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            name="namespace"
            render={({ field }) => (
              <FormControl
                label="Namespace"
                isError={Boolean(errors.namespace)}
                errorText={errors.namespace?.message}
                className="mb-4"
              >
                <Input {...field} placeholder="e.g., admin, dev, prod" autoComplete="off" />
              </FormControl>
            )}
          />

          <Controller
            control={control}
            name="connectionId"
            render={({ field }) => {
              const selectedConnection = vaultConnections.find((conn) => conn.id === field.value);

              return (
                <FormControl
                  label="Vault Connection"
                  isError={Boolean(errors.connectionId)}
                  errorText={errors.connectionId?.message}
                  tooltipText="Select a HashiCorp Vault app connection for this namespace"
                >
                  <FilterableSelect
                    value={selectedConnection || null}
                    onChange={(newValue) => {
                      const singleValue = Array.isArray(newValue) ? newValue[0] : newValue;
                      if (singleValue && "id" in singleValue) {
                        field.onChange(singleValue.id);
                      } else {
                        field.onChange("");
                      }
                    }}
                    isLoading={isLoadingConnections}
                    options={vaultConnections}
                    placeholder="Select connection..."
                    getOptionLabel={(option) => option.name}
                    getOptionValue={(option) => option.id}
                  />
                </FormControl>
              );
            }}
          />

          <div className="mt-8 flex items-center gap-2">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting || isCreating || isUpdating}
              isDisabled={isSubmitting || isCreating || isUpdating}
            >
              {isEdit ? "Update" : "Create"}
            </Button>
            <Button colorSchema="secondary" variant="plain" onClick={handleClose}>
              Cancel
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
