import { Controller, useFormContext } from "react-hook-form";

import { FormControl, Input } from "@app/components/v2";
import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import { PkiSyncConnectionField } from "./PkiSyncConnectionField";

export const LinuxServerPkiSyncFields = () => {
  const { control } = useFormContext<TPkiSyncForm & { destination: PkiSync.LinuxServer }>();

  return (
    <>
      <PkiSyncConnectionField />
      <Controller
        name="destinationConfig.destinationPath"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            errorText={error?.message}
            label="Destination Directory"
            tooltipText="The absolute path to the directory on the server where certificate files are written. The directory must already exist."
          >
            <Input value={value ?? ""} onChange={onChange} placeholder="/etc/ssl/certs" />
          </FormControl>
        )}
      />
    </>
  );
};
