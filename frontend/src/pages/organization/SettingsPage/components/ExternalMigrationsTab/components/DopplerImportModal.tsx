import { useMemo } from "react";
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
import { useGetUserProjects } from "@app/hooks/api";
import {
  useGetDopplerEnvironments,
  useGetDopplerProjects,
  useImportDopplerSecrets
} from "@app/hooks/api/migration";
import { TDopplerExternalMigrationConfig } from "@app/hooks/api/migration/types";
import { ProjectType } from "@app/hooks/api/projects/types";

const schema = z.object({
  dopplerProject: z.string().min(1, "Doppler project is required"),
  dopplerEnvironment: z.string().min(1, "Doppler environment is required"),
  targetProjectId: z.string().min(1, "Target project is required"),
  targetEnvironment: z.string().min(1, "Target environment is required"),
  targetSecretPath: z.string().min(1, "Secret path is required")
});

type FormData = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  config: TDopplerExternalMigrationConfig;
};

export const DopplerImportModal = ({ isOpen, onOpenChange, config }: Props) => {
  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      dopplerProject: "",
      dopplerEnvironment: "",
      targetProjectId: "",
      targetEnvironment: "",
      targetSecretPath: "/"
    }
  });

  const selectedDopplerProject = watch("dopplerProject");
  const selectedTargetProjectId = watch("targetProjectId");

  const { data: dopplerProjects = [], isPending: isLoadingProjects } = useGetDopplerProjects(
    config.id
  );
  const { data: dopplerEnvironments = [], isPending: isLoadingEnvironments } =
    useGetDopplerEnvironments(config.id, selectedDopplerProject || undefined);

  const { data: userProjects = [], isPending: isLoadingUserProjects } = useGetUserProjects();

  const secretManagerProjects = useMemo(
    () => userProjects.filter((p) => p.type === ProjectType.SecretManager),
    [userProjects]
  );

  const selectedProject = useMemo(
    () => secretManagerProjects.find((p) => p.id === selectedTargetProjectId),
    [secretManagerProjects, selectedTargetProjectId]
  );

  const { mutateAsync: importSecrets } = useImportDopplerSecrets();

  const onFormSubmit = async (data: FormData) => {
    await importSecrets({
      configId: config.id,
      dopplerProject: data.dopplerProject,
      dopplerEnvironment: data.dopplerEnvironment,
      targetProjectId: data.targetProjectId,
      targetEnvironment: data.targetEnvironment,
      targetSecretPath: data.targetSecretPath
    });
    createNotification({
      type: "success",
      text: "Secrets imported successfully from Doppler"
    });
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
        title="Import Secrets from Doppler"
        subTitle="Select source and destination to import secrets"
        bodyClassName="overflow-visible"
      >
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <p className="mb-4 text-sm font-medium text-mineshaft-300">Doppler Source</p>

          <Controller
            control={control}
            name="dopplerProject"
            render={({ field }) => {
              const selectedItem = dopplerProjects.find((p) => p.slug === field.value);

              return (
                <FormControl
                  label="Project"
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
                  label="Environment"
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

          <p className="mb-4 mt-6 text-sm font-medium text-mineshaft-300">Infisical Destination</p>

          <Controller
            control={control}
            name="targetProjectId"
            render={({ field }) => {
              const selectedItem = secretManagerProjects.find((p) => p.id === field.value);

              return (
                <FormControl
                  label="Project"
                  isError={Boolean(errors.targetProjectId)}
                  errorText={errors.targetProjectId?.message}
                >
                  <FilterableSelect
                    value={selectedItem || null}
                    onChange={(newValue) => {
                      const singleValue = Array.isArray(newValue) ? newValue[0] : newValue;
                      if (singleValue && "id" in singleValue) {
                        field.onChange(singleValue.id);
                      } else {
                        field.onChange("");
                      }
                    }}
                    isLoading={isLoadingUserProjects}
                    options={secretManagerProjects}
                    placeholder="Select Infisical project..."
                    getOptionLabel={(option) => option.name}
                    getOptionValue={(option) => option.id}
                  />
                </FormControl>
              );
            }}
          />

          <Controller
            control={control}
            name="targetEnvironment"
            render={({ field }) => {
              const environments = selectedProject?.environments ?? [];
              const selectedItem = environments.find((e) => e.slug === field.value);

              return (
                <FormControl
                  label="Environment"
                  isError={Boolean(errors.targetEnvironment)}
                  errorText={errors.targetEnvironment?.message}
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
                    isDisabled={!selectedTargetProjectId}
                    options={environments}
                    placeholder="Select environment..."
                    getOptionLabel={(option) => option.name}
                    getOptionValue={(option) => option.slug}
                  />
                </FormControl>
              );
            }}
          />

          <Controller
            control={control}
            name="targetSecretPath"
            render={({ field, fieldState: { error } }) => (
              <FormControl
                label="Secret Path"
                isError={Boolean(error)}
                errorText={error?.message}
                tooltipText="The path in Infisical where secrets will be imported"
              >
                <Input {...field} placeholder="e.g., /" autoComplete="off" />
              </FormControl>
            )}
          />

          <div className="mt-8 flex items-center gap-2">
            <Button
              className="mr-4"
              size="sm"
              type="submit"
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
            >
              Import Secrets
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
