import { Controller, useFormContext } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { FormControl, Switch, Tooltip } from "@app/components/v2";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";

export const AzureKeyVaultSyncOptionsFields = () => {
  const { control } = useFormContext<TSecretSyncForm & { destination: SecretSync.AzureKeyVault }>();

  return (
    <Controller
      control={control}
      name="syncOptions.disableCertificateImport"
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <FormControl isError={Boolean(error)} errorText={error?.message}>
          <Switch
            className="bg-mineshaft-400/80 shadow-inner data-[state=checked]:bg-green/80"
            id="disable-certificate-import"
            thumbClassName="bg-mineshaft-800"
            onCheckedChange={onChange}
            isChecked={value}
          >
            <p className="w-64">
              Disable Certificate Import{" "}
              <Tooltip
                className="max-w-md"
                content={
                  <>
                    <p>
                      When enabled, Infisical will <span className="font-medium">not</span> import
                      certificate objects from Azure Key Vault when syncing secrets.
                    </p>
                    <p className="mt-4">
                      Enable this option if you want to keep your secrets project free of
                      certificate objects that Azure Key Vault exposes through the secrets API.
                    </p>
                  </>
                }
              >
                <FontAwesomeIcon icon={faQuestionCircle} size="sm" className="ml-1" />
              </Tooltip>
            </p>
          </Switch>
        </FormControl>
      )}
    />
  );
};
