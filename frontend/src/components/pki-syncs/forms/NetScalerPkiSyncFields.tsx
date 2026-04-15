import { Controller, useFormContext } from "react-hook-form";

import { FormControl, Input } from "@app/components/v2";
import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import { PkiSyncConnectionField } from "./PkiSyncConnectionField";

export const NetScalerPkiSyncFields = () => {
  const { control } = useFormContext<TPkiSyncForm & { destination: PkiSync.NetScaler }>();

  return (
    <>
      <PkiSyncConnectionField />
      <Controller
        name="destinationConfig.vserverName"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="SSL vServer Name"
            isOptional
            tooltipText="The name of the SSL virtual server to bind the certificate to. Leave empty to only upload the certificate without binding."
          >
            <Input value={value ?? ""} onChange={onChange} placeholder="e.g. vs-ssl-prod" />
          </FormControl>
        )}
      />
    </>
  );
};
