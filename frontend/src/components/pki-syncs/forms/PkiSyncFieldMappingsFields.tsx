import { Controller, useFormContext } from "react-hook-form";

import { FormControl, Input } from "@app/components/v2";
import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";

type Props = {
  destination?: PkiSync;
};

export const PkiSyncFieldMappingsFields = ({ destination }: Props) => {
  const { control, watch } = useFormContext<TPkiSyncForm>();
  const currentDestination = destination || watch("destination");

  if (currentDestination !== PkiSync.Chef && currentDestination !== PkiSync.AwsSecretsManager) {
    return null;
  }

  return (
    <>
      <p className="mb-4 text-sm text-bunker-300">
        Configure how certificate fields are mapped to your{" "}
        {currentDestination === PkiSync.Chef ? "Chef data bag items" : "AWS secrets"}.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <Controller
          control={control}
          name="syncOptions.fieldMappings.certificate"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              isError={Boolean(error)}
              errorText={error?.message}
              label="Certificate Field"
              tooltipText={`The field name used to store the certificate content in the ${currentDestination === PkiSync.Chef ? "Chef data bag item" : "AWS secret"}.`}
            >
              <Input {...field} placeholder="certificate" />
            </FormControl>
          )}
        />

        <Controller
          control={control}
          name="syncOptions.fieldMappings.privateKey"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              isError={Boolean(error)}
              errorText={error?.message}
              label="Private Key Field"
              tooltipText={`The field name used to store the private key content in the ${currentDestination === PkiSync.Chef ? "Chef data bag item" : "AWS secret"}.`}
            >
              <Input {...field} placeholder="private_key" />
            </FormControl>
          )}
        />

        <Controller
          control={control}
          name="syncOptions.fieldMappings.certificateChain"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              isError={Boolean(error)}
              errorText={error?.message}
              label="Certificate Chain Field"
              tooltipText={`The field name used to store the certificate chain content in the ${currentDestination === PkiSync.Chef ? "Chef data bag item" : "AWS secret"}.`}
            >
              <Input {...field} placeholder="certificate_chain" />
            </FormControl>
          )}
        />

        <Controller
          control={control}
          name="syncOptions.fieldMappings.caCertificate"
          render={({ field, fieldState: { error } }) => (
            <FormControl
              isError={Boolean(error)}
              errorText={error?.message}
              label="CA Certificate Field"
              tooltipText={`The field name used to store the CA certificate content in the ${currentDestination === PkiSync.Chef ? "Chef data bag item" : "AWS secret"}.`}
            >
              <Input {...field} placeholder="ca_certificate" />
            </FormControl>
          )}
        />
      </div>

      <div className="mt-6 rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-4">
        <h4 className="mb-2 text-sm font-medium text-mineshaft-100">Preview JSON Structure</h4>
        <pre className="text-xs text-bunker-300">
          {`{
  "id": "certificate-item-name",
  "${watch("syncOptions.fieldMappings.certificate") || "certificate"}": "<certificate-content>",
  "${watch("syncOptions.fieldMappings.privateKey") || "private_key"}": "<private-key-content>",
  "${watch("syncOptions.fieldMappings.certificateChain") || "certificate_chain"}": "<certificate-chain-content>",
  "${watch("syncOptions.fieldMappings.caCertificate") || "ca_certificate"}": "<ca-certificate-content>"
}`}
        </pre>
      </div>
    </>
  );
};
