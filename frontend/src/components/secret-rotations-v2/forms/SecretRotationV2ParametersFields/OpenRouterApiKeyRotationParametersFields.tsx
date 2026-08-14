import { Controller, useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { FieldLabelWithTooltip } from "@app/components/secret-rotations-v2/forms/shared";
import {
  Field,
  FieldContent,
  FieldError,
  FieldFeedback,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch
} from "@app/components/v3";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { OpenRouterLimitReset } from "@app/hooks/api/secretRotationsV2/types/open-router-api-key-rotation";

const NO_RESET_VALUE = "none";

/** Max length for OpenRouter API key name (matches backend schema). */
const OPEN_ROUTER_API_KEY_NAME_MAX_LENGTH = 100;

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
        render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabelWithTooltip
              htmlFor="openrouter-key-name"
              tooltip="A descriptive name for the generated API key"
            >
              Key Name
            </FieldLabelWithTooltip>
            <Input
              ref={ref}
              id="openrouter-key-name"
              value={value}
              onBlur={onBlur}
              onChange={onChange}
              placeholder="My Rotated API Key"
              maxLength={OPEN_ROUTER_API_KEY_NAME_MAX_LENGTH}
              isError={Boolean(error)}
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      <Controller
        name="parameters.limit"
        control={control}
        render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabelWithTooltip
              htmlFor="openrouter-credit-limit"
              tooltip="Optional spending limit in USD for the generated API key"
            >
              Credit Limit (USD) <span className="font-normal text-muted">(optional)</span>
            </FieldLabelWithTooltip>
            <Input
              ref={ref}
              id="openrouter-credit-limit"
              type="number"
              value={value ?? ""}
              onBlur={onBlur}
              onChange={(e) => {
                const val = e.target.value;
                onChange(val === "" ? null : Number(val));
              }}
              placeholder="Leave blank for unlimited"
              isError={Boolean(error)}
            />
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      <Controller
        name="parameters.limitReset"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)}>
            <FieldLabelWithTooltip tooltip="How often the spending limit resets (daily, weekly, or monthly). Resets happen at midnight UTC.">
              Reset Limit Every <span className="font-normal text-muted">(optional)</span>
            </FieldLabelWithTooltip>
            <Select
              disabled={!limit}
              value={value ?? NO_RESET_VALUE}
              onValueChange={(val) => onChange(val === NO_RESET_VALUE ? null : val)}
            >
              <SelectTrigger className="w-full" isError={Boolean(error)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {LIMIT_RESET_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      <Controller
        name="parameters.includeByokInLimit"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field orientation="horizontal" data-invalid={Boolean(error)}>
            <Switch
              id="include-byok-in-limit"
              checked={value ?? false}
              onCheckedChange={onChange}
              variant="project"
            />
            <FieldContent>
              <Label htmlFor="include-byok-in-limit">Include BYOK</Label>
              <FieldFeedback
                id="include-byok-in-limit-feedback"
                description={
                  (value ?? false)
                    ? "BYOK (Bring Your Own Key) usage will count toward this key's spending limit."
                    : "Only OpenRouter credits count toward the limit. BYOK usage is tracked separately."
                }
                error={error?.message}
              />
            </FieldContent>
          </Field>
        )}
      />
    </>
  );
};
