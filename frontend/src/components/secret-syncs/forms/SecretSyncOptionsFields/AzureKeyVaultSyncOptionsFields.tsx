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

import { TSecretSyncForm } from "../schemas";

export const AzureKeyVaultSyncOptionsFields = () => {
  const { control } = useFormContext<TSecretSyncForm & { destination: SecretSync.AzureKeyVault }>();

  return (
    <Controller
      control={control}
      name="syncOptions.disableCertificateImport"
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <Field className="mb-4">
          <Field orientation="horizontal">
            <FieldContent>
              <Label htmlFor="disable-certificate-import">Disable certificate import</Label>
              <FieldDescription>
                When enabled, Infisical will not import certificate objects from Azure Key Vault
                when syncing secrets. Use this to keep your secrets project free of certificate
                objects that Azure Key Vault exposes through the secrets API.
              </FieldDescription>
            </FieldContent>
            <Switch
              id="disable-certificate-import"
              variant="project"
              checked={value}
              onCheckedChange={onChange}
            />
          </Field>
          <FieldError errors={[error]} />
        </Field>
      )}
    />
  );
};
