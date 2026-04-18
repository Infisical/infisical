import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { components, GroupHeadingProps, OptionProps } from "react-select";
import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon } from "lucide-react";
import { z } from "zod";

import {
  Badge,
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
import { useGetDopplerConfigs, useGetDopplerProjects } from "@app/hooks/api/migration/queries";
import { TDopplerConfig, TExternalMigrationConfig } from "@app/hooks/api/migration/types";

const schema = z.object({
  configId: z.string().min(1, "Doppler configuration is required"),
  dopplerProject: z.string().min(1, "Doppler project is required"),
  dopplerEnvironment: z.string().min(1, "Doppler config is required")
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

const DopplerConfigGroupHeading = (props: GroupHeadingProps<TDopplerConfig>) => (
  <components.GroupHeading
    {...props}
    className="px-2 py-1.5 text-xs font-semibold tracking-wider text-muted uppercase"
  />
);

const formatConfigLabel = (config: TDopplerConfig) => {
  if (config.root) {
    return config.name;
  }
  // Branch configs are named like "env_branch" — show only the branch suffix
  const prefix = `${config.environment}_`;
  const branchName = config.name.startsWith(prefix)
    ? config.name.slice(prefix.length)
    : config.name;
  return branchName;
};

const DopplerConfigOption = (props: OptionProps<TDopplerConfig>) => {
  const { data } = props;
  return (
    <components.Option {...props}>
      <div className="flex items-center gap-2">
        <span>{formatConfigLabel(data)}</span>
        {data.root && <Badge variant="project">Root</Badge>}
      </div>
    </components.Option>
  );
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
  const { data: dopplerConfigs = [], isPending: isLoadingConfigs } = useGetDopplerConfigs(
    selectedConfigId || undefined,
    selectedDopplerProject || undefined
  );

  const sortedDopplerConfigs = useMemo(() => {
    return [...dopplerConfigs].sort((a, b) => {
      // Group by environment first
      if (a.environment !== b.environment) {
        return a.environment.localeCompare(b.environment);
      }
      // Root configs come first within each environment
      if (a.root !== b.root) {
        return a.root ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [dopplerConfigs]);

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
            Select a Doppler project and config to import secrets into the current Infisical folder.
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
              const selectedItem = sortedDopplerConfigs.find((c) => c.name === field.value);

              return (
                <Field>
                  <FieldLabel>Source Config</FieldLabel>
                  <FieldContent>
                    <FilterableSelect
                      value={selectedItem || null}
                      onChange={(newValue) => {
                        const singleValue = Array.isArray(newValue) ? newValue[0] : newValue;
                        if (singleValue && "name" in singleValue) {
                          field.onChange(singleValue.name);
                        } else {
                          field.onChange("");
                        }
                      }}
                      isLoading={isLoadingConfigs && Boolean(selectedDopplerProject)}
                      isDisabled={!selectedDopplerProject}
                      options={sortedDopplerConfigs}
                      placeholder="Select source config..."
                      getOptionLabel={formatConfigLabel}
                      getOptionValue={(option) => option.name}
                      groupBy="environment"
                      components={{
                        GroupHeading: DopplerConfigGroupHeading,
                        Option: DopplerConfigOption
                      }}
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
