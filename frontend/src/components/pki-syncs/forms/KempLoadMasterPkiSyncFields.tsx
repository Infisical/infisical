import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Info } from "lucide-react";

import {
  Field,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { PkiSync, TKempVirtualService, useListKempVirtualServices } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import { PkiSyncConnectionField } from "./PkiSyncConnectionField";

const getVirtualServiceLabel = (vs: TKempVirtualService) =>
  vs.name ? `${vs.name} (${vs.address}:${vs.port})` : `${vs.address}:${vs.port}`;

export const KempLoadMasterPkiSyncFields = () => {
  const { control, setValue } = useFormContext<
    TPkiSyncForm & { destination: PkiSync.KempLoadMaster }
  >();

  const connectionId = useWatch({ control, name: "connection.id" });

  const { data: virtualServices = [], isLoading: isLoadingVirtualServices } =
    useListKempVirtualServices({ connectionId }, { enabled: Boolean(connectionId) });

  return (
    <>
      <PkiSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.virtualServiceId", undefined);
        }}
      />
      <Controller
        name="destinationConfig.virtualServiceId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>
              Virtual Service <span className="text-muted">(optional)</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  The Virtual Service to bind the certificate to. Leave unset to only import the
                  certificate without binding it to a Virtual Service.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <FilterableSelect
              isDisabled={!connectionId}
              isLoading={Boolean(connectionId) && isLoadingVirtualServices}
              isClearable
              options={virtualServices}
              value={virtualServices.find((vs) => vs.id === value) ?? null}
              onChange={(option) => onChange((option as TKempVirtualService | null)?.id)}
              getOptionLabel={(option) => getVirtualServiceLabel(option as TKempVirtualService)}
              getOptionValue={(option) => (option as TKempVirtualService).id}
              placeholder={
                connectionId
                  ? "Leave unset to import certificate only"
                  : "Select a connection first"
              }
              isError={Boolean(error)}
            />
            <FieldError errors={[error]} />
          </Field>
        )}
      />
    </>
  );
};
