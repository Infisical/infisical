import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { CLAUDE_CODE_SECRET_DETECTED_ACTION_MAP } from "@app/helpers/secretScanningV2";
import { SecretScanningDataSource } from "@app/hooks/api/secretScanningV2";
import { ClaudeCodeSecretDetectedAction } from "@app/hooks/api/secretScanningV2/types/claude-code-data-source";

import { TSecretScanningDataSourceForm } from "../schemas";

type TClaudeCodeForm = TSecretScanningDataSourceForm & {
  type: SecretScanningDataSource.ClaudeCode;
};

export const ClaudeCodeDataSourceScanFields = () => {
  const { control } = useFormContext<TClaudeCodeForm>();

  return (
    <Controller
      name="config.onSecretDetected"
      control={control}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="secret-scanning-claude-code-on-secret-detected">
            When a Secret Is Detected
          </FieldLabel>
          <FieldContent>
            <Select value={value} onValueChange={onChange}>
              <SelectTrigger
                id="secret-scanning-claude-code-on-secret-detected"
                aria-describedby="secret-scanning-claude-code-on-secret-detected-help"
                isError={Boolean(error)}
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {Object.values(ClaudeCodeSecretDetectedAction).map((action) => (
                  <SelectItem
                    key={action}
                    value={action}
                    description={CLAUDE_CODE_SECRET_DETECTED_ACTION_MAP[action].description}
                  >
                    {CLAUDE_CODE_SECRET_DETECTED_ACTION_MAP[action].name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription id="secret-scanning-claude-code-on-secret-detected-help">
              {value
                ? CLAUDE_CODE_SECRET_DETECTED_ACTION_MAP[value].description
                : "Choose what happens when a prompt contains a secret."}
            </FieldDescription>
            <FieldError errors={[error]} />
          </FieldContent>
        </Field>
      )}
    />
  );
};
