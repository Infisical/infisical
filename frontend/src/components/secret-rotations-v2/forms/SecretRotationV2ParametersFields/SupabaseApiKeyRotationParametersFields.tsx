import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FilterableSelect, FormControl } from "@app/components/v2";
import {
  TSupabaseProject,
  useSupabaseConnectionListProjects
} from "@app/hooks/api/appConnections/supabase";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { SupabaseApiKeyType } from "@app/hooks/api/secretRotationsV2/types/supabase-api-key-rotation";

const KEY_TYPE_OPTIONS = [
  { label: "Publishable", value: SupabaseApiKeyType.Publishable },
  { label: "Secret", value: SupabaseApiKeyType.Secret }
];

const formatProjectOptionLabel = (option: TSupabaseProject) => (
  <span>
    {option.name} <span className="text-mineshaft-400">(id: {option.id})</span>
  </span>
);

export const SupabaseApiKeyRotationParametersFields = () => {
  const { control } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.SupabaseApiKey;
    }
  >();

  const connectionId = useWatch({ name: "connection.id", control });

  const { data: projects = [], isPending: isProjectsLoading } = useSupabaseConnectionListProjects(
    connectionId,
    {
      enabled: Boolean(connectionId)
    }
  );

  return (
    <>
      <Controller
        name="parameters.projectRef"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Project"
            tooltipText="The Supabase project to rotate the API key for"
          >
            <FilterableSelect
              isLoading={isProjectsLoading && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={projects.find((p) => p.id === value) ?? null}
              onChange={(option) => {
                const v = option as SingleValue<TSupabaseProject>;
                onChange(v?.id ?? null);
              }}
              options={projects}
              placeholder="Select a project..."
              getOptionLabel={(option) => `${option.name} (id: ${option.id})`}
              getOptionValue={(option) => option.id}
              formatOptionLabel={formatProjectOptionLabel}
            />
          </FormControl>
        )}
      />
      <Controller
        name="parameters.keyType"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Key Type"
            tooltipText="Publishable keys are safe to use in browsers and client-side code. Secret keys grant privileged access to the project API and should never be exposed publicly."
          >
            <FilterableSelect
              value={KEY_TYPE_OPTIONS.find((o) => o.value === value) ?? null}
              onChange={(option) =>
                onChange(
                  (option as SingleValue<{ label: string; value: SupabaseApiKeyType }>)?.value ??
                    null
                )
              }
              options={KEY_TYPE_OPTIONS}
              getOptionLabel={(option) => option.label}
              getOptionValue={(option) => option.value}
              placeholder="Select a key type..."
            />
          </FormControl>
        )}
      />
    </>
  );
};
