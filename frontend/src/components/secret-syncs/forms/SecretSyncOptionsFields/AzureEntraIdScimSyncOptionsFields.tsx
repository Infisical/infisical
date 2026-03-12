import { useEffect } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { FilterableSelect, FormControl } from "@app/components/v2";
import { useProject } from "@app/context";
import { useGetProjectSecrets } from "@app/hooks/api/secrets/queries";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const AzureEntraIdScimSyncOptionsFields = () => {
  const { control, setValue } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.AzureEntraIdScim }
  >();

  const { currentProject } = useProject();
  const environment = useWatch({ control, name: "environment" });
  const secretPath = useWatch({ control, name: "secretPath" });
  const currentSecretKey = useWatch({ control, name: "syncOptions.secretKey" });

  const existingSecretId = useWatch({
    control,
    name: "syncOptions.secretId" as "syncOptions.secretKey"
  });

  const { data: secrets, isLoading } = useGetProjectSecrets({
    projectId: currentProject.id,
    environment: environment?.slug ?? "",
    secretPath: secretPath ?? "/",
    viewSecretValue: false,
    options: {
      enabled: Boolean(environment?.slug && secretPath)
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

  return (
    <Controller
      name="syncOptions.secretKey"
      control={control}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <FormControl
          isError={Boolean(error)}
          errorText={error?.message}
          label="Secret"
          tooltipText="The secret whose value will be used as the SCIM provisioning token."
        >
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
            isClearable
            isDisabled={!environment?.slug || !secretPath}
          />
        </FormControl>
      )}
    />
  );
};
