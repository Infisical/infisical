import { Controller, useFormContext } from "react-hook-form";
import { Info } from "lucide-react";

import {
  Field,
  FieldError,
  FieldLabel,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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
        render={({ field: { value, onChange, ...field }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>
              Data Bag Name
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  Enter your Chef data bag name where certificates will be stored. This data bag
                  will be used to store SSL/TLS certificates, private keys, and certificate chains.
                  Data bag names must contain only alphanumeric characters, underscores, and
                  hyphens.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <Input
              {...field}
              value={value ?? ""}
              onChange={onChange}
              placeholder="ssl_certificates"
              maxLength={255}
              isError={Boolean(error)}
            />
            <FieldError errors={[error]} />
          </Field>
        )}
      />
    </>
  );
};
