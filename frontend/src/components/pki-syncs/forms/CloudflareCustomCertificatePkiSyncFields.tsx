import { Controller, useFormContext } from "react-hook-form";
import { Info } from "lucide-react";

import {
  Combobox,
  Field,
  FieldError,
  FieldLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useCloudflareConnectionListZones } from "@app/hooks/api/appConnections/cloudflare";
import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { PkiSyncConnectionField } from "./PkiSyncConnectionField";
import { TPkiSyncForm } from "./schemas/pki-sync-schema";

export const CloudflareCustomCertificatePkiSyncFields = () => {
  const { control, watch, setValue } = useFormContext<
    TPkiSyncForm & { destination: PkiSync.CloudflareCustomCertificate }
  >();

  const connection = watch("connection");
  const connectionId = connection?.id;

  const { data: zones = [], isPending: isZonesLoading } = useCloudflareConnectionListZones(
    connectionId ?? "",
    {
      enabled: !!connectionId
    }
  );

  return (
    <>
      <PkiSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.zoneId", "");
        }}
      />
      <Controller
        name="destinationConfig.zoneId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel htmlFor="pki-sync-cloudflare-zone">
              Zone
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  Select the Cloudflare zone (domain) where the custom SSL certificate will be
                  uploaded.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <Combobox
              id="pki-sync-cloudflare-zone"
              isLoading={isZonesLoading && !!connectionId}
              isDisabled={!connectionId}
              value={
                zones.find((zone) => zone.id === value) ||
                (value ? { id: value, name: value } : null)
              }
              isClearable={false}
              onValueChange={(option) => {
                onChange(option.id);
              }}
              options={zones}
              placeholder={connectionId ? "Select a zone..." : "Select a connection first"}
              getOptionLabel={(option) => option.name}
              getOptionValue={(option) => option.id}
              getOptionKeywords={(option) => [option.id]}
              isError={Boolean(error)}
            />
            <FieldError errors={[error]} />
          </Field>
        )}
      />
    </>
  );
};
