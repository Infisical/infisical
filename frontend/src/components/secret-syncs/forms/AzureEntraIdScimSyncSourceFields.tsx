import { useEffect } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { subject } from "@casl/ability";
import { Info } from "lucide-react";

import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  SecretPathInput,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useProject, useProjectPermission } from "@app/context";
import {
  ProjectPermissionSecretSyncActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { useGetProjectSecrets } from "@app/hooks/api/secrets/queries";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "./schemas";

export const AzureEntraIdScimSyncSourceFields = () => {
  const { control, watch, setError, clearErrors, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AzureEntraIdScim }
  >();

  const { permission } = useProjectPermission();
  const { currentProject } = useProject();

  const selectedEnvironment = watch("environment");
  const selectedSecretPath = watch("secretPath");
  const currentSecretKey = useWatch({ control, name: "syncOptions.secretKey" });

  const existingSecretId = useWatch({
    control,
    name: "syncOptions.secretId" as "syncOptions.secretKey"
  });

  const { data: secrets, isLoading } = useGetProjectSecrets({
    projectId: currentProject.id,
    environment: selectedEnvironment?.slug ?? "",
    secretPath: selectedSecretPath ?? "/",
    viewSecretValue: false,
    options: {
      enabled: Boolean(selectedEnvironment?.slug && selectedSecretPath)
    }
  });

  useEffect(() => {
    if (existingSecretId && !currentSecretKey && secrets?.length) {
      const match = secrets.find((s) => s.id === existingSecretId);
      if (match) {
        setValue("syncOptions.secretKey", match.key);
      }
    }
  }, [existingSecretId, currentSecretKey, secrets, setValue]);

  useEffect(() => {
    if (!selectedEnvironment) {
      clearErrors("secretPath");
      return;
    }

    const hasAccessToSource = permission.can(
      ProjectPermissionSecretSyncActions.Create,
      subject(ProjectPermissionSub.SecretSyncs, {
        environment: selectedEnvironment.slug,
        secretPath: selectedSecretPath
      })
    );

    if (!hasAccessToSource) {
      setError("secretPath", {
        message: "You do not have permission to create secret syncs in this environment or path."
      });
    } else {
      clearErrors("secretPath");
    }
  }, [selectedEnvironment, selectedSecretPath]);

  return (
    <>
      <p className="mb-4 text-sm text-bunker-300">
        Specify the environment and path where you would like to sync secrets from.
      </p>

      <FieldGroup>
        <Controller
          defaultValue={currentProject.environments[0]}
          control={control}
          name="environment"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Environment</FieldLabel>
              <FieldContent>
                <FilterableSelect
                  value={value}
                  onChange={onChange}
                  options={currentProject.environments}
                  placeholder="Select environment..."
                  getOptionLabel={(option) => option?.name}
                  getOptionValue={(option) => option?.id}
                  isError={Boolean(error)}
                />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
        <Controller
          defaultValue="/"
          control={control}
          name="secretPath"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Secret Path</FieldLabel>
              <FieldContent>
                <SecretPathInput
                  environment={selectedEnvironment?.slug}
                  value={value}
                  onChange={onChange}
                  isError={Boolean(error)}
                />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
        <Controller
          name="syncOptions.secretKey"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>
                Secret
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The secret whose value will be used as the SCIM provisioning token.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <FieldContent>
                <FilterableSelect
                  value={secrets?.find((s) => s.key === value) ?? null}
                  onChange={(option) => {
                    const selected = option as { id: string; key: string } | null;
                    onChange(selected?.key ?? "");
                  }}
                  isLoading={isLoading}
                  options={secrets ?? []}
                  placeholder="Select a secret..."
                  getOptionLabel={(option) => option.key}
                  getOptionValue={(option) => option.id}
                  isDisabled={!selectedEnvironment?.slug || !selectedSecretPath}
                  isError={Boolean(error)}
                />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      </FieldGroup>
    </>
  );
};
