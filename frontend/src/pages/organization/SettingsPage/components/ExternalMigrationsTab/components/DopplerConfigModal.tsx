import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FilterableSelect, FormControl, Modal, ModalContent } from "@app/components/v2";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { useListAppConnections } from "@app/hooks/api/appConnections/queries";
import {
  useCreateDopplerExternalMigrationConfig,
  useUpdateDopplerExternalMigrationConfig
} from "@app/hooks/api/migration";
import { TDopplerExternalMigrationConfig } from "@app/hooks/api/migration/types";

const schema = z.object({
  connectionId: z.string().min(1, "Connection is required")
});

type FormData = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  editConfig?: TDopplerExternalMigrationConfig;
};

export const DopplerConfigModal = ({ isOpen, onOpenChange, editConfig }: Props) => {
  const isEdit = Boolean(editConfig);

  const { data: appConnections = [], isPending: isLoadingConnections } = useListAppConnections();

  const dopplerConnections = useMemo(
    () => appConnections.filter((conn) => conn.app === AppConnection.Doppler),
    [appConnections]
  );

  const { mutateAsync: createConfig, isPending: isCreating } =
    useCreateDopplerExternalMigrationConfig();
  const { mutateAsync: updateConfig, isPending: isUpdating } =
    useUpdateDopplerExternalMigrationConfig();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      connectionId: ""
    }
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        connectionId: editConfig?.connectionId || ""
      });
    }
  }, [isOpen, editConfig, reset]);

  const onFormSubmit = async (data: FormData) => {
    if (isEdit && editConfig) {
      await updateConfig({ id: editConfig.id, connectionId: data.connectionId });
      createNotification({ type: "success", text: "Doppler configuration updated successfully" });
    } else {
      await createConfig({ connectionId: data.connectionId });
      createNotification({ type: "success", text: "Doppler configuration created successfully" });
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
        title={isEdit ? "Edit Doppler Configuration" : "Add Doppler Configuration"}
        subTitle="Configure a Doppler connection for in-platform migration tooling"
        bodyClassName="overflow-visible"
      >
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <Controller
            control={control}
            name="connectionId"
            render={({ field }) => {
              const selectedConnection = dopplerConnections.find((conn) => conn.id === field.value);

              return (
                <FormControl
                  label="Doppler Connection"
                  isError={Boolean(errors.connectionId)}
                  errorText={errors.connectionId?.message}
                  tooltipText="Select a Doppler app connection"
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
                    options={dopplerConnections}
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
