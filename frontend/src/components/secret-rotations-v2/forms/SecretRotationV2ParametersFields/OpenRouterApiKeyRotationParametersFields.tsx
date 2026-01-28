import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FormControl, Input, Select, SelectItem, Switch } from "@app/components/v2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { OpenRouterLimitReset } from "@app/hooks/api/secretRotationsV2/types/open-router-api-key-rotation";

const NO_RESET_VALUE = "none";

const LIMIT_RESET_OPTIONS = [
  { label: "No Reset", value: NO_RESET_VALUE },
  { label: "Daily", value: OpenRouterLimitReset.Daily },
  { label: "Weekly", value: OpenRouterLimitReset.Weekly },
  { label: "Monthly", value: OpenRouterLimitReset.Monthly }
];

export const OpenRouterApiKeyRotationParametersFields = () => {
  const { control, watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.OpenRouterApiKey;
    }
  >();

  const limit = watch("parameters.limit");

  return (
    <>
      <Controller
        name="parameters.name"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Key Name"
            tooltipText="A descriptive name for the generated API key"
          >
            <Input value={value} onChange={onChange} placeholder="My Rotated API Key" />
          </FormControl>
        )}
      />
      <Controller
        name="parameters.limit"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Credit Limit (USD)"
            isOptional
            tooltipText="Optional spending limit in USD for the generated API key"
          >
            <Input
              type="number"
              value={value ?? ""}
              onChange={(e) => {
                const val = e.target.value;
                onChange(val === "" ? null : Number(val));
              }}
              placeholder="Leave blank for unlimited"
            />
          </FormControl>
        )}
      />
      <Controller
        name="parameters.limitReset"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Reset Limit Every"
            isOptional
            tooltipText="How often the spending limit resets (daily, weekly, or monthly). Resets happen at midnight UTC."
          >
            <Select
              value={value ?? NO_RESET_VALUE}
              onValueChange={(val) => onChange(val === NO_RESET_VALUE ? null : val)}
              className="w-full"
              isDisabled={!limit}
            >
              {LIMIT_RESET_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
      <Controller
        name="parameters.includeByokInLimit"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Include BYOK in limit"
            isOptional
            tooltipText="When enabled, usage from your own provider keys (BYOK - Bring Your Own Key) counts toward this key's spending limit. When disabled, only OpenRouter credits are counted. See OpenRouter BYOK docs for details."
          >
            <Switch
              className="bg-mineshaft-400/80 shadow-inner data-[state=checked]:bg-green/80"
              id="include-byok-in-limit"
              thumbClassName="bg-mineshaft-800"
              onCheckedChange={(checked) => onChange(checked)}
              isChecked={value ?? false}
            >
              <p className="w-[9.6rem]">{value ? "Yes" : "No"}</p>
            </Switch>
          </FormControl>
        )}
      />
    </>
  );
};
