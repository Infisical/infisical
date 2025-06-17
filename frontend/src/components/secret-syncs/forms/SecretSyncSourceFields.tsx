import { useEffect } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { subject } from "@casl/ability";

import { FilterableSelect, FormControl } from "@app/components/v2";
import { SecretPathInput } from "@app/components/v2/SecretPathInput";
import { useProjectPermission, useWorkspace } from "@app/context";
import {
  ProjectPermissionSecretSyncActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

import { TSecretSyncForm } from "./schemas";

export const SecretSyncSourceFields = () => {
  const { control, watch, setError, clearErrors } = useFormContext<TSecretSyncForm>();

  const { permission } = useProjectPermission();
  const { currentWorkspace } = useWorkspace();

  const selectedEnvironment = watch("environment");
  const selectedSecretPath = watch("secretPath");

  useEffect(() => {
    const hasAccessToSource =
      selectedEnvironment &&
      permission.can(
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

      <Controller
        defaultValue={currentWorkspace.environments[0]}
        control={control}
        name="environment"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl label="Environment" isError={Boolean(error)} errorText={error?.message}>
            <FilterableSelect
              value={value}
              onChange={onChange}
              options={currentWorkspace.environments}
              placeholder="Select environment..."
              getOptionLabel={(option) => option?.name}
              getOptionValue={(option) => option?.id}
            />
          </FormControl>
        )}
      />
      <Controller
        defaultValue="/"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl isError={Boolean(error)} errorText={error?.message} label="Secret Path">
            <SecretPathInput
              environment={selectedEnvironment?.slug}
              value={value}
              onChange={onChange}
            />
          </FormControl>
        )}
        control={control}
        name="secretPath"
      />
    </>
  );
};
