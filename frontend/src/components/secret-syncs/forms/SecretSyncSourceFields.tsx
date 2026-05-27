import { useEffect } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { subject } from "@casl/ability";

import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  SecretPathInput
} from "@app/components/v3";
import { useProject, useProjectPermission } from "@app/context";
import {
  ProjectPermissionSecretSyncActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { AzureEntraIdScimSyncSourceFields } from "./AzureEntraIdScimSyncSourceFields";
import { TSecretSyncForm } from "./schemas";

const DefaultSecretSyncSourceFields = () => {
  const { control, watch, setError, clearErrors } = useFormContext<TSecretSyncForm>();

  const { permission } = useProjectPermission();
  const { currentProject } = useProject();

  const selectedEnvironment = watch("environment");
  const selectedSecretPath = watch("secretPath");

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
    </FieldGroup>
  );
};

export const SecretSyncSourceFields = () => {
  const { control } = useFormContext<TSecretSyncForm>();
  const destination = useWatch({ control, name: "destination" });

  switch (destination) {
    case SecretSync.AzureEntraIdScim:
      return <AzureEntraIdScimSyncSourceFields />;
    default:
      return <DefaultSecretSyncSourceFields />;
  }
};
