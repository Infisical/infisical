import { Controller, useFormContext, useWatch } from "react-hook-form";
import { AxiosError } from "axios";
import { Info, Loader2Icon } from "lucide-react";

import {
  Field,
  FieldError,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { PkiSync } from "@app/hooks/api/pkiSyncs";
import { useListImpervaSites } from "@app/hooks/api/pkiSyncs/queries";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import { PkiSyncConnectionField } from "./PkiSyncConnectionField";

type TImpervaForm = TPkiSyncForm & { destination: PkiSync.Imperva };

export const ImpervaPkiSyncFields = () => {
  const { control, setValue } = useFormContext<TImpervaForm>();

  const connectionId = useWatch({ name: "connection.id", control });

  const {
    data: sites,
    isFetching: isLoadingSites,
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
              <FieldLabel>
                Website
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The Imperva website that will receive the custom certificate. Imperva holds one
                    custom certificate per website for each key type.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              {connectionId && isLoadingSites ? (
                <div className="flex items-center gap-2 py-2 text-sm text-muted">
                  <Loader2Icon className="size-4 animate-spin" />
                  Loading websites...
                </div>
              ) : (
                <Select
                  value={value ?? ""}
                  onValueChange={(newValue) => {
                    const site = sites?.find((s) => s.id === newValue);
                    onChange(newValue);
                    setValue("destinationConfig.siteName", site?.name ?? "");
                  }}
                  disabled={!connectionId || isLoadingSites}
                >
                  <SelectTrigger className="w-full" isError={Boolean(combinedError)}>
                    <SelectValue
                      placeholder={connectionId ? "Select a website" : "Select a connection first"}
                    />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {(sites ?? []).map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <FieldError errors={[combinedError]} />
            </Field>
          );
        }}
      />
    </>
  );
};
