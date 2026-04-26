import { useEffect, useRef } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FormControl, Input } from "@app/components/v2";
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
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Input
                value={value}
                onChange={onChange}
                placeholder={keyType ? DEFAULT_SECRET_NAME[keyType] : "SUPABASE_API_KEY"}
              />
            </FormControl>
          )}
          control={control}
          name="secretsMapping.apiKey"
        />
      )
    }
  ];

  return <SecretsMappingTable items={items} />;
};
