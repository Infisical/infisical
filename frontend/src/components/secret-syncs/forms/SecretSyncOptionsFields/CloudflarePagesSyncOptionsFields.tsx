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
import { CLOUDFLARE_PAGES_VARIABLE_TYPE_LABELS } from "@app/helpers/secretSyncs";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { CloudflarePagesVariableType } from "@app/hooks/api/secretSyncs/types/cloudflare-pages-sync";

import { TSecretSyncForm } from "../schemas";

export const CloudflarePagesSyncOptionsFields = () => {
  const { control } = useFormContext<
    TSecretSyncForm & { destination: SecretSync.CloudflarePages }
  >();

  return (
    <Controller
      name="destinationConfig.variableType"
      control={control}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <Field className="mb-4">
          <FieldLabel htmlFor="cloudflare-pages-variable-type">Variable type</FieldLabel>
          <FieldContent>
            {/* A sync without a type predates the option and skips same-name text variables, so a type is
                only saved once someone picks one. The backend gives new syncs Secret. */}
            <Select value={value ?? CloudflarePagesVariableType.Secret} onValueChange={onChange}>
              <SelectTrigger
                id="cloudflare-pages-variable-type"
                className="w-full"
                isError={Boolean(error)}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {Object.entries(CLOUDFLARE_PAGES_VARIABLE_TYPE_LABELS).map(([type, label]) => (
                  <SelectItem value={type} key={type}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              Secrets are encrypted in Cloudflare, while text variables stay readable.
            </FieldDescription>
            <FieldError errors={[error]} />
          </FieldContent>
        </Field>
      )}
    />
  );
};
