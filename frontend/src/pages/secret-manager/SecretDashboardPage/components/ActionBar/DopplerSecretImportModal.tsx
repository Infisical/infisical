import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon } from "lucide-react";
import { z } from "zod";

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
  FieldLabel
} from "@app/components/v3";
import { FilterableSelect } from "@app/components/v3/generic/ReactSelect";
import { useListAppConnections } from "@app/hooks/api/appConnections/queries";
import { useGetDopplerEnvironments, useGetDopplerProjects } from "@app/hooks/api/migration/queries";
import { TExternalMigrationConfig } from "@app/hooks/api/migration/types";

const schema = z.object({
  configId: z.string().min(1, "Doppler configuration is required"),
  dopplerProject: z.string().min(1, "Doppler project is required"),
  dopplerEnvironment: z.string().min(1, "Doppler environment is required")
});

type FormData = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  configs: TExternalMigrationConfig[];
  environment: string;
  secretPath: string;
  onImport: (dopplerProject: string, dopplerEnvironment: string, configId: string) => Promise<void>;
};

export const DopplerSecretImportModal = ({
  isOpen,
  onOpenChange,
  configs,
  environment,
  secretPath,
  onImport
}: Props) => {
  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      configId: "",
      dopplerProject: "",
      dopplerEnvironment: ""
    }
  });

  const selectedConfigId = watch("configId");
  const selectedDopplerProject = watch("dopplerProject");

  const hasMultipleConfigs = configs.length > 1;
  const { data: appConnections = [] } = useListAppConnections(undefined, {
    enabled: hasMultipleConfigs
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        configId: configs.length === 1 ? configs[0].id : "",
        dopplerProject: "",
        dopplerEnvironment: ""
      });
    }
  }, [isOpen, reset, configs]);

  const { data: dopplerProjects = [], isPending: isLoadingProjects } = useGetDopplerProjects(
    selectedConfigId || undefined
  );
  const { data: dopplerEnvironments = [], isPending: isLoadingEnvironments } =
    useGetDopplerEnvironments(selectedConfigId || undefined, selectedDopplerProject || undefined);

  const configOptions = useMemo(
    () =>
      configs.map((c) => {
        const conn = appConnections.find((a) => a.id === c.connectionId);
        return { id: c.id, label: conn?.name ?? c.id };
      }),
    [configs, appConnections]
  );

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

  const onFormSubmit = async (data: FormData) => {
    await onImport(data.dopplerProject, data.dopplerEnvironment, data.configId);
    handleClose();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-lg overflow-visible" showCloseButton>
        <DialogHeader>
          <DialogTitle>Import from Doppler</DialogTitle>
          <DialogDescription>
            Select a Doppler project and environment to import secrets into the current Infisical
            folder.
          </DialogDescription>
        </DialogHeader>

        <div className="mb-4 flex items-start gap-3 rounded-md border border-project/20 bg-project/5 p-3 text-sm text-project">
          <InfoIcon className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium text-foreground">Import destination</p>
            <p className="mt-1 text-foreground/75">
              Secrets will be imported into environment{" "}
              <code className="text-xs">{environment}</code> at path{" "}
              <code className="text-xs">{secretPath}</code>.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
          {hasMultipleConfigs && (
            <Controller
              control={control}
              name="configId"
              render={({ field }) => {
                const selectedItem = configOptions.find((o) => o.id === field.value);
                return (
                  <Field>
                    <FieldLabel>Doppler Configuration</FieldLabel>
                    <FieldContent>
                      <FilterableSelect
                        value={selectedItem || null}
                        onChange={(newValue) => {
                          const single = Array.isArray(newValue) ? newValue[0] : newValue;
                          field.onChange(single && "id" in single ? single.id : "");
                        }}
                        options={configOptions}
                        placeholder="Select Doppler configuration..."
                        getOptionLabel={(option) => option.label}
                        getOptionValue={(option) => option.id}
                      />
                    </FieldContent>
                    <FieldError>{errors.configId?.message}</FieldError>
                  </Field>
                );
              }}
            />
          )}

          <Controller
            control={control}
            name="dopplerProject"
            render={({ field }) => {
              const selectedItem = dopplerProjects.find((p) => p.slug === field.value);

              return (
                <Field>
                  <FieldLabel>Source Project</FieldLabel>
                  <FieldContent>
                    <FilterableSelect
                      value={selectedItem || null}
                      onChange={(newValue) => {
                        const singleValue = Array.isArray(newValue) ? newValue[0] : newValue;
                        if (singleValue && "slug" in singleValue) {
                          field.onChange(singleValue.slug);
                        } else {
                          field.onChange("");
                        }
                      }}
                      isLoading={isLoadingProjects && Boolean(selectedConfigId)}
                      isDisabled={!selectedConfigId}
                      options={dopplerProjects}
                      placeholder="Select source project..."
                      getOptionLabel={(option) => option.name}
                      getOptionValue={(option) => option.slug}
                    />
                  </FieldContent>
                  <FieldError>{errors.dopplerProject?.message}</FieldError>
                </Field>
              );
            }}
          />

          <Controller
            control={control}
            name="dopplerEnvironment"
            render={({ field }) => {
              const selectedItem = dopplerEnvironments.find((e) => e.slug === field.value);

              return (
                <Field>
                  <FieldLabel>Source Environment</FieldLabel>
                  <FieldContent>
                    <FilterableSelect
                      value={selectedItem || null}
                      onChange={(newValue) => {
                        const singleValue = Array.isArray(newValue) ? newValue[0] : newValue;
                        if (singleValue && "slug" in singleValue) {
                          field.onChange(singleValue.slug);
                        } else {
                          field.onChange("");
                        }
                      }}
                      isLoading={isLoadingEnvironments && Boolean(selectedDopplerProject)}
                      isDisabled={!selectedDopplerProject}
                      options={dopplerEnvironments}
                      placeholder="Select source environment..."
                      getOptionLabel={(option) => option.name}
                      getOptionValue={(option) => option.slug}
                    />
                  </FieldContent>
                  <FieldError>{errors.dopplerEnvironment?.message}</FieldError>
                </Field>
              );
            }}
          />

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="project"
              isPending={isSubmitting}
              isDisabled={isSubmitting}
            >
              Import Secrets
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
