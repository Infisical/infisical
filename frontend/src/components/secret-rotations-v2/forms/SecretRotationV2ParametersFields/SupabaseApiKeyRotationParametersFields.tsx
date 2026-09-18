import { Controller, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import { Field, FieldError, FilterableSelect } from "@app/components/v3";
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
    {option.name} <span className="text-muted">(id: {option.id})</span>
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
        render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabelWithTooltip
              htmlFor="supabase-project"
              tooltip="The Supabase project to rotate the API key for"
            >
              Project
            </FieldLabelWithTooltip>
            <FilterableSelect
              inputId="supabase-project"
              isLoading={isProjectsLoading && Boolean(connectionId)}
              isDisabled={!connectionId}
              value={projects.find((p) => p.id === value) ?? null}
              onBlur={onBlur}
              onChange={(option) => {
                const v = option as SingleValue<TSupabaseProject>;
                onChange(v?.id ?? null);
              }}
              options={projects}
              placeholder="Select a project..."
              getOptionLabel={(option) => `${option.name} (id: ${option.id})`}
              getOptionValue={(option) => option.id}
              formatOptionLabel={formatProjectOptionLabel}
              isError={Boolean(error)}
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      <Controller
        name="parameters.keyType"
        control={control}
        render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabelWithTooltip
              htmlFor="supabase-key-type"
              tooltip="Publishable keys are safe to use in browsers and client-side code. Secret keys grant privileged access to the project API and should never be exposed publicly."
            >
              Key Type
            </FieldLabelWithTooltip>
            <FilterableSelect
              inputId="supabase-key-type"
              value={KEY_TYPE_OPTIONS.find((o) => o.value === value) ?? null}
              onBlur={onBlur}
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
              isError={Boolean(error)}
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
    </>
  );
};
