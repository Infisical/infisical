import { Controller, useFormContext } from "react-hook-form";

import { FormControl, Input } from "@app/components/v2";
import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import { PkiSyncConnectionField } from "./PkiSyncConnectionField";

export const WindowsServerPkiSyncFields = () => {
  const { control } = useFormContext<TPkiSyncForm & { destination: PkiSync.WindowsServer }>();

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
            tooltipText="The absolute Windows path to the directory where certificate files are written (for example C:\certs). It is created if it does not exist."
          >
            <Input value={value ?? ""} onChange={onChange} placeholder="C:\certs" />
          </FormControl>
        )}
      />
    </>
  );
};
