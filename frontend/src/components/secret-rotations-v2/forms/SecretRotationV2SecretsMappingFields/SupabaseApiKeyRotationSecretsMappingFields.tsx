import { useEffect, useRef } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { Field, FieldError, Input } from "@app/components/v3";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { SupabaseApiKeyType } from "@app/hooks/api/secretRotationsV2/types/supabase-api-key-rotation";

import { SecretsMappingTable } from "./shared";

const DEFAULT_SECRET_NAME: Record<SupabaseApiKeyType, string> = {
  [SupabaseApiKeyType.Publishable]: "SUPABASE_PUBLISHABLE_API_KEY",
  [SupabaseApiKeyType.Secret]: "SUPABASE_SECRET_API_KEY"
};

export const SupabaseApiKeyRotationSecretsMappingFields = () => {
  const { control, watch, setValue } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.SupabaseApiKey;
    }
  >();

  const keyType = watch("parameters.keyType");
  const prevKeyTypeRef = useRef<SupabaseApiKeyType | undefined>(undefined);

  useEffect(() => {
    if (keyType && prevKeyTypeRef.current !== keyType) {
      setValue("secretsMapping.apiKey", DEFAULT_SECRET_NAME[keyType]);
    }
    prevKeyTypeRef.current = keyType;
  }, [keyType, setValue]);

  const items = [
    {
      name: "API Key",
      input: (
        <Controller
          render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
            <Field data-invalid={Boolean(error)}>
              <Input
                ref={ref}
                value={value}
                onBlur={onBlur}
                onChange={onChange}
                placeholder={keyType ? DEFAULT_SECRET_NAME[keyType] : "SUPABASE_API_KEY"}
                isError={Boolean(error)}
              />
              <FieldError>{error?.message}</FieldError>
            </Field>
          )}
          control={control}
          name="secretsMapping.apiKey"
        />
      )
    }
  ];

  return <SecretsMappingTable items={items} />;
};
