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
import { CLOUDFLARE_WORKERS_VARIABLE_TYPE_LABELS } from "@app/helpers/secretSyncs";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { CloudflareWorkersVariableType } from "@app/hooks/api/secretSyncs/types/cloudflare-workers-sync";

import { TSecretSyncForm } from "../schemas";

export const CloudflareWorkersSyncOptionsFields = () => {
  const { control } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.CloudflareWorkers }
  >();

  return (
    <Controller
      name="destinationConfig.variableType"
      control={control}
      defaultValue={CloudflareWorkersVariableType.Secret}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <Field className="mb-4">
          <FieldLabel htmlFor="cloudflare-workers-variable-type">Variable type</FieldLabel>
          <FieldContent>
            <Select value={value} onValueChange={onChange}>
              <SelectTrigger
                id="cloudflare-workers-variable-type"
                className="w-full"
                isError={Boolean(error)}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {Object.entries(CLOUDFLARE_WORKERS_VARIABLE_TYPE_LABELS).map(([type, label]) => (
                  <SelectItem value={type} key={type}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              Secrets are encrypted in Cloudflare, while text and JSON variables stay readable.
            </FieldDescription>
            <FieldError errors={[error]} />
          </FieldContent>
        </Field>
      )}
    />
  );
};
