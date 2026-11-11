import { Controller, useFormContext } from "react-hook-form";
import { Info } from "lucide-react";

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
import { CloudflareBundleMethod } from "@app/hooks/api/pkiSyncs/types/cloudflare-custom-certificate-sync";

import { TPkiSyncForm } from "../schemas/pki-sync-schema";

const AUTOMATIC = "automatic";

export const CloudflareCustomCertificateSyncOptions = () => {
  const { control } = useFormContext<TPkiSyncForm>();

  return (
    <Controller
      control={control}
      name="syncOptions.bundleMethod"
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <Field className="mb-4">
          <FieldLabel>
            Bundle method
            <Tooltip>
              <TooltipTrigger asChild>
                <Info />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                How Cloudflare builds the chain it serves. Compatible and Modern may replace or drop
                the intermediates you upload. User-defined serves the uploaded chain exactly, which
                is required for certificates from a CA that is not publicly trusted. Automatic uses
                User-defined for certificates from an Infisical CA and Compatible for all others.
              </TooltipContent>
            </Tooltip>
          </FieldLabel>
          <Select
            value={value ?? AUTOMATIC}
            onValueChange={(v) =>
              onChange(v === AUTOMATIC ? undefined : (v as CloudflareBundleMethod))
            }
          >
            <SelectTrigger className="w-full" isError={Boolean(error)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value={AUTOMATIC}>Automatic</SelectItem>
              <SelectItem value={CloudflareBundleMethod.Ubiquitous}>Compatible</SelectItem>
              <SelectItem value={CloudflareBundleMethod.Optimal}>Modern</SelectItem>
              <SelectItem value={CloudflareBundleMethod.Force}>User-defined</SelectItem>
            </SelectContent>
          </Select>
          <FieldError errors={[error]} />
        </Field>
      )}
    />
  );
};
