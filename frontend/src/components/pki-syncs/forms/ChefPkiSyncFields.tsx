import { Controller, useFormContext } from "react-hook-form";

import { FormControl, Input } from "@app/components/v2";
import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import { PkiSyncConnectionField } from "./PkiSyncConnectionField";

export const ChefPkiSyncFields = () => {
  const { control, setValue } = useFormContext<TPkiSyncForm & { destination: PkiSync.Chef }>();

  return (
    <>
      <PkiSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.dataBagName", "");
        }}
      />
      <Controller
        name="destinationConfig.dataBagName"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Data Bag Name"
            tooltipText="Enter your Chef data bag name where certificates will be stored. This data bag will be used to store SSL/TLS certificates, private keys, and certificate chains. Data bag names must contain only alphanumeric characters, underscores, and hyphens."
          >
            <Input {...field} placeholder="ssl_certificates" maxLength={255} />
          </FormControl>
        )}
      />
    </>
  );
};
