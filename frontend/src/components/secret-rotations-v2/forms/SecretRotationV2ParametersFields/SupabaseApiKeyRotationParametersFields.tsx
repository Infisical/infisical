import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FormControl, Input, Select, SelectItem } from "@app/components/v2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { SupabaseApiKeyType } from "@app/hooks/api/secretRotationsV2/types/supabase-api-key-rotation";

const KEY_TYPE_OPTIONS = [
  { label: "Publishable", value: SupabaseApiKeyType.Publishable },
  { label: "Secret", value: SupabaseApiKeyType.Secret }
];

export const SupabaseApiKeyRotationParametersFields = () => {
  const { control } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.SupabaseApiKey;
    }
  >();

  return (
    <>
      <Controller
        name="parameters.projectRef"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Project Reference"
            tooltipText="The reference ID of the Supabase project"
          >
            <Input value={value} onChange={onChange} placeholder="your-project-ref" />
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
            <Select value={value} onValueChange={onChange} className="w-full">
              {KEY_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
    </>
  );
};
