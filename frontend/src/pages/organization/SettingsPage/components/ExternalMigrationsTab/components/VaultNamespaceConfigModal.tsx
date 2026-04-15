import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableInput
} from "@app/components/v3";
import { FilterableSelect } from "@app/components/v3/generic/ReactSelect";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { useListAppConnections } from "@app/hooks/api/appConnections/queries";
import {
  useCreateExternalMigrationConfig,
  useUpdateExternalMigrationConfig
} from "@app/hooks/api/migration";
import {
  ExternalMigrationProviders,
  TExternalMigrationConfig
} from "@app/hooks/api/migration/types";

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
  editConfig?: TExternalMigrationConfig;
};

export const VaultNamespaceConfigModal = ({ isOpen, onOpenChange, editConfig }: Props) => {
  const isEdit = Boolean(editConfig);

  const { data: appConnections = [], isPending: isLoadingConnections } = useListAppConnections();

  const vaultConnections = useMemo(
    () => appConnections.filter((conn) => conn.app === AppConnection.HCVault),
    [appConnections]
  );

  const { mutateAsync: createConfig, isPending: isCreating } = useCreateExternalMigrationConfig();
  const { mutateAsync: updateConfig, isPending: isUpdating } = useUpdateExternalMigrationConfig();

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

  useEffect(() => {
    if (isOpen) {
      reset({
        namespace: "",
        connectionId: editConfig?.connectionId || ""
      });
    }
  }, [isOpen, editConfig, reset]);

  const onFormSubmit = async (data: FormData) => {
    const input = {
      provider: ExternalMigrationProviders.Vault as const,
      config: { namespace: data.namespace }
    };

    if (isEdit && editConfig) {
      await updateConfig({
        id: editConfig.id,
        connectionId: data.connectionId,
        input
      });
      createNotification({
        type: "success",
        text: "Namespace configuration updated successfully"
      });
    } else {
      await createConfig({
        connectionId: data.connectionId,
        input
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

  const isPending = isSubmitting || isCreating || isUpdating;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          reset();
          onOpenChange(false);
        }
      }}
    >
      <DialogContent className="max-w-lg overflow-visible" showCloseButton>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Namespace Configuration" : "Add Namespace Configuration"}
          </DialogTitle>
          <DialogDescription>
            Configure a HashiCorp Vault namespace{" "}
            {isEdit ? "configuration" : "for migration tooling"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
          <Controller
            control={control}
            name="namespace"
            render={({ field }) => (
              <Field>
                <FieldLabel>Namespace</FieldLabel>
                <FieldContent>
                  <UnstableInput
                    {...field}
                    placeholder="e.g., admin, dev, prod"
                    autoComplete="off"
                    isError={Boolean(errors.namespace)}
                  />
                </FieldContent>
                <FieldError>{errors.namespace?.message}</FieldError>
              </Field>
            )}
          />

          <Controller
            control={control}
            name="connectionId"
            render={({ field }) => {
              const selectedConnection = vaultConnections.find((conn) => conn.id === field.value);

              return (
                <Field>
                  <FieldLabel className="inline-flex items-center gap-1">
                    Vault Connection
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex cursor-default">
                          <InfoIcon className="size-3 text-accent" aria-hidden />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        Select a HashiCorp Vault app connection for this namespace
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <FieldContent>
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
                  </FieldContent>
                  <FieldError>{errors.connectionId?.message}</FieldError>
                </Field>
              );
            }}
          />

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" variant="org" isPending={isPending} isDisabled={isPending}>
              {isEdit ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
