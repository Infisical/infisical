import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { SecretPathInput } from "@app/components/v2/SecretPathInput";
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
  TooltipTrigger
} from "@app/components/v3";
import { FilterableSelect } from "@app/components/v3/generic/ReactSelect";
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

  useEffect(() => {
    if (isOpen) reset();
  }, [isOpen, reset]);

  const selectedDopplerProject = watch("dopplerProject");
  const selectedTargetProjectId = watch("targetProjectId");
  const selectedTargetEnvironment = watch("targetEnvironment");

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
    const result = await importSecrets({
      configId: config.id,
      dopplerProject: data.dopplerProject,
      dopplerEnvironment: data.dopplerEnvironment,
      targetProjectId: data.targetProjectId,
      targetEnvironment: data.targetEnvironment,
      targetSecretPath: data.targetSecretPath
    });
    createNotification({
      type: "success",
      text:
        result.status === "approval-required"
          ? "Secrets submitted for approval — review the pending request in your project"
          : `${result.imported} secret${result.imported !== 1 ? "s" : ""} imported successfully from Doppler`
    });
    reset();
    onOpenChange(false);
  };

  const handleClose = () => {
    reset();
    onOpenChange(false);
  };

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
          <DialogTitle>Import Secrets from Doppler</DialogTitle>
          <DialogDescription>Select source and destination to import secrets</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
          <p className="text-sm font-medium text-muted">Doppler Source</p>

          <Controller
            control={control}
            name="dopplerProject"
            render={({ field }) => {
              const selectedItem = dopplerProjects.find((p) => p.slug === field.value);

              return (
                <Field>
                  <FieldLabel>Project</FieldLabel>
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
                      isLoading={isLoadingProjects}
                      options={dopplerProjects}
                      placeholder="Select Doppler project..."
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
                  <FieldLabel>Environment</FieldLabel>
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
                      isLoading={isLoadingEnvironments}
                      isDisabled={!selectedDopplerProject}
                      options={dopplerEnvironments}
                      placeholder="Select Doppler environment..."
                      getOptionLabel={(option) => option.name}
                      getOptionValue={(option) => option.slug}
                    />
                  </FieldContent>
                  <FieldError>{errors.dopplerEnvironment?.message}</FieldError>
                </Field>
              );
            }}
          />

          <p className="pt-2 text-sm font-medium text-muted">Infisical Destination</p>

          <Controller
            control={control}
            name="targetProjectId"
            render={({ field }) => {
              const selectedItem = secretManagerProjects.find((p) => p.id === field.value);

              return (
                <Field>
                  <FieldLabel>Project</FieldLabel>
                  <FieldContent>
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
                  </FieldContent>
                  <FieldError>{errors.targetProjectId?.message}</FieldError>
                </Field>
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
                <Field>
                  <FieldLabel>Environment</FieldLabel>
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
                      isDisabled={!selectedTargetProjectId}
                      options={environments}
                      placeholder="Select environment..."
                      getOptionLabel={(option) => option.name}
                      getOptionValue={(option) => option.slug}
                    />
                  </FieldContent>
                  <FieldError>{errors.targetEnvironment?.message}</FieldError>
                </Field>
              );
            }}
          />

          <Controller
            control={control}
            name="targetSecretPath"
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel className="inline-flex items-center gap-1">
                  Secret Path
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex cursor-default">
                        <InfoIcon className="size-3 text-accent" aria-hidden />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      The path in Infisical where secrets will be imported
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <FieldContent>
                  <SecretPathInput
                    value={field.value}
                    onChange={field.onChange}
                    projectId={selectedTargetProjectId}
                    environment={selectedTargetEnvironment}
                  />
                </FieldContent>
                <FieldError>{error?.message}</FieldError>
              </Field>
            )}
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
