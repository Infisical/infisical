import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  Label,
  Switch
} from "@app/components/v3";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { QoveryVariableType } from "@app/hooks/api/secretSyncs/types/qovery-sync";

import { TSecretSyncForm } from "../schemas";

export const QoverySyncOptionsFields = () => {
  const { control } = useFormContext<TSecretSyncForm & { destination: SecretSync.Qovery }>();

  return (
    <Controller
      name="destinationConfig.variableType"
      control={control}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <Field className="mb-4">
          <Field orientation="horizontal">
            <FieldContent>
              <Label htmlFor="qovery-variable-type">Sync as environment variables</Label>
              <FieldDescription>
                When enabled, values are written as Qovery environment variables (their value is
                readable in Qovery). When disabled, they are written as environment secrets (their
                value is hidden).
              </FieldDescription>
            </FieldContent>
            <Switch
              id="qovery-variable-type"
              variant="project"
              checked={value === QoveryVariableType.Variable}
              onCheckedChange={(checked) =>
                onChange(checked ? QoveryVariableType.Variable : QoveryVariableType.Secret)
              }
            />
          </Field>
          <FieldError errors={[error]} />
        </Field>
      )}
    />
  );
};
