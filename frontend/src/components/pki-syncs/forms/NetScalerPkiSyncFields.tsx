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

export const NetScalerPkiSyncFields = () => {
  const { control } = useFormContext<TPkiSyncForm & { destination: PkiSync.NetScaler }>();

  return (
    <>
      <PkiSyncConnectionField />
      <Controller
        name="destinationConfig.vserverName"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>
              SSL vServer Name <span className="text-muted">(optional)</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  The name of the SSL virtual server to bind the certificate to. Leave empty to only
                  upload the certificate without binding.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <Input
              value={value ?? ""}
              onChange={onChange}
              placeholder="e.g. vs-ssl-prod"
              isError={Boolean(error)}
            />
            <FieldError errors={[error]} />
          </Field>
        )}
      />
    </>
  );
};
