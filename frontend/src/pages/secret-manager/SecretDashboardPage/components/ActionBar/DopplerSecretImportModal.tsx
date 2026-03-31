import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  Button,
  FilterableSelect,
  FormControl,
  Modal,
  ModalClose,
  ModalContent
} from "@app/components/v2";
import { useListAppConnections } from "@app/hooks/api/appConnections/queries";
import { useGetDopplerEnvironments, useGetDopplerProjects } from "@app/hooks/api/migration/queries";
import { TDopplerExternalMigrationConfig } from "@app/hooks/api/migration/types";

const schema = z.object({
  configId: z.string().min(1, "Doppler configuration is required"),
  dopplerProject: z.string().min(1, "Doppler project is required"),
  dopplerEnvironment: z.string().min(1, "Doppler environment is required")
});

type FormData = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  configs: TDopplerExternalMigrationConfig[];
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
    setValue,
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
  const { data: appConnections = [] } = useListAppConnections({ enabled: hasMultipleConfigs });

  // Auto-select when there is exactly one config
  useEffect(() => {
    if (configs.length === 1 && configs[0].id) {
      setValue("configId", configs[0].id);
    }
  }, [configs, setValue]);

  useEffect(() => {
    if (isOpen) reset();
  }, [isOpen, reset]);

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
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) reset();
        onOpenChange(open);
      }}
    >
      <ModalContent
        bodyClassName="overflow-visible"
        title="Import from Doppler"
        subTitle="Select a Doppler project and environment to import secrets into the current Infisical folder."
        className="max-w-2xl"
      >
        <div className="mb-4 rounded-md bg-primary/10 p-3 text-sm text-mineshaft-200">
          <div className="flex items-start gap-2">
            <FontAwesomeIcon icon={faInfoCircle} className="mt-0.5 text-primary" />
            <div>
              <div className="mb-2">
                <strong>Import secrets from Doppler</strong>
              </div>
              <div className="space-y-1.5 text-xs leading-relaxed">
                <p>
                  Secrets will be imported into environment{" "}
                  <code className="text-xs">{environment}</code> at path{" "}
                  <code className="text-xs">{secretPath}</code>.
                </p>
              </div>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit(onFormSubmit)}>
          {hasMultipleConfigs && (
            <Controller
              control={control}
              name="configId"
              render={({ field }) => {
                const selectedItem = configOptions.find((o) => o.id === field.value);
                return (
                  <FormControl
                    label="Doppler configuration"
                    className="mb-4"
                    isError={Boolean(errors.configId)}
                    errorText={errors.configId?.message}
                  >
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
                  </FormControl>
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
                <FormControl
                  label="Doppler project"
                  className="mb-4"
                  isError={Boolean(errors.dopplerProject)}
                  errorText={errors.dopplerProject?.message}
                >
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
                    isLoading={isLoadingProjects}
                    isDisabled={!selectedConfigId}
                    options={dopplerProjects}
                    placeholder="Select Doppler project..."
                    getOptionLabel={(option) => option.name}
                    getOptionValue={(option) => option.slug}
                  />
                </FormControl>
              );
            }}
          />

          <Controller
            control={control}
            name="dopplerEnvironment"
            render={({ field }) => {
              const selectedItem = dopplerEnvironments.find((e) => e.slug === field.value);

              return (
                <FormControl
                  label="Doppler environment"
                  className="mb-4"
                  isError={Boolean(errors.dopplerEnvironment)}
                  errorText={errors.dopplerEnvironment?.message}
                >
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
                    isLoading={isLoadingEnvironments}
                    isDisabled={!selectedDopplerProject}
                    options={dopplerEnvironments}
                    placeholder="Select Doppler environment..."
                    getOptionLabel={(option) => option.name}
                    getOptionValue={(option) => option.slug}
                  />
                </FormControl>
              );
            }}
          />

          <div className="mt-8 flex space-x-4">
            <Button type="submit" isLoading={isSubmitting} isDisabled={isSubmitting}>
              Import secrets
            </Button>
            <ModalClose asChild>
              <Button colorSchema="secondary" variant="plain">
                Cancel
              </Button>
            </ModalClose>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
