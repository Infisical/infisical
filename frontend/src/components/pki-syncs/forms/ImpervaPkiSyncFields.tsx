import { Controller, useFormContext, useWatch } from "react-hook-form";
import { AxiosError } from "axios";
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
import { PkiSync } from "@app/hooks/api/pkiSyncs";
import { useListImpervaSites } from "@app/hooks/api/pkiSyncs/queries";

import { PkiSyncConnectionField } from "./PkiSyncConnectionField";
import { TPkiSyncForm } from "./schemas/pki-sync-schema";

type TImpervaForm = TPkiSyncForm & { destination: PkiSync.Imperva };

export const ImpervaPkiSyncFields = () => {
  const { control, setValue } = useFormContext<TImpervaForm>();

  const connectionId = useWatch({ name: "connection.id", control });
  const siteName = useWatch({ name: "destinationConfig.siteName", control });

  const {
    data: sites,
    isLoading: isLoadingSites,
    isError: isSitesError,
    error: sitesError
  } = useListImpervaSites(
    { connectionId },
    {
      enabled: Boolean(connectionId)
    }
  );

  return (
    <>
      <PkiSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.siteId", "");
          setValue("destinationConfig.siteName", "");
        }}
      />
      <Controller
        name="destinationConfig.siteId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => {
          const siteOptions = sites ?? [];
          const siteFetchErrorText =
            isSitesError && connectionId
              ? ((sitesError as AxiosError<{ message?: string }>)?.response?.data?.message ??
                "Failed to fetch websites. Check connection settings.")
              : undefined;

          const combinedError =
            error ??
            (siteFetchErrorText ? { type: "manual", message: siteFetchErrorText } : undefined);

          return (
            <Field className="mb-4">
              <FieldLabel htmlFor="pki-sync-imperva-site">
                Website
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The Imperva website that will receive the custom certificate. Imperva holds one
                    custom certificate per website, so this sync carries a single certificate.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Combobox
                id="pki-sync-imperva-site"
                isDisabled={!connectionId}
                isLoading={Boolean(connectionId) && isLoadingSites}
                options={siteOptions}
                value={
                  siteOptions.find((site) => site.id === value) ??
                  (value ? { id: value, name: siteName || value } : null)
                }
                onValueChange={(option) => {
                  onChange(option?.id ?? "");
                  setValue("destinationConfig.siteName", option?.name ?? "");
                }}
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                getOptionKeywords={(option) => [option.id]}
                placeholder={connectionId ? "Select a website" : "Select a connection first"}
                isError={Boolean(combinedError)}
              />
              <FieldError errors={[combinedError]} />
            </Field>
          );
        }}
      />
    </>
  );
};
