import { ReactNode } from "react";
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
import { AWS_REGIONS } from "@app/helpers/appConnections";
import { PkiSync } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import { PkiSyncConnectionField } from "./PkiSyncConnectionField";

type Props = {
  tooltip: ReactNode;
};

export const AwsRegionField = ({ tooltip }: Props) => {
  const { control, setValue } = useFormContext<
    TPkiSyncForm & { destination: PkiSync.AwsCertificateManager | PkiSync.AwsSecretsManager }
  >();

  return (
    <>
      <PkiSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.region", "");
        }}
      />
      <Controller
        name="destinationConfig.region"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>
              AWS Region
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">{tooltip}</TooltipContent>
              </Tooltip>
            </FieldLabel>
            <Select value={field.value ?? ""} onValueChange={field.onChange}>
              <SelectTrigger className="w-full capitalize" isError={Boolean(error)}>
                <SelectValue placeholder="Select an AWS region" />
              </SelectTrigger>
              <SelectContent position="popper">
                {AWS_REGIONS.map(({ name, slug }) => (
                  <SelectItem value={slug} key={slug}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError errors={[error]} />
          </Field>
        )}
      />
    </>
  );
};
