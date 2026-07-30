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

type Props = {
  destination?: PkiSync;
};

export const PkiSyncFieldMappingsFields = ({ destination }: Props) => {
  const { control, watch } = useFormContext<TPkiSyncForm>();
  const currentDestination = destination || watch("destination");

  if (currentDestination !== PkiSync.Chef && currentDestination !== PkiSync.AwsSecretsManager) {
    return null;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Controller
          control={control}
          name="syncOptions.fieldMappings.certificate"
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                Certificate Field
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    {`The field name used to store the certificate content in the ${currentDestination === PkiSync.Chef ? "Chef data bag item" : "AWS secret"}.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input {...field} placeholder="certificate" isError={Boolean(error)} />
              <FieldError errors={[error]} />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="syncOptions.fieldMappings.privateKey"
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                Private Key Field
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    {`The field name used to store the private key content in the ${currentDestination === PkiSync.Chef ? "Chef data bag item" : "AWS secret"}.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input {...field} placeholder="private_key" isError={Boolean(error)} />
              <FieldError errors={[error]} />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="syncOptions.fieldMappings.certificateChain"
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                Certificate Chain Field
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    {`The field name used to store the certificate chain content in the ${currentDestination === PkiSync.Chef ? "Chef data bag item" : "AWS secret"}.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input {...field} placeholder="certificate_chain" isError={Boolean(error)} />
              <FieldError errors={[error]} />
            </Field>
          )}
        />

        <Controller
          control={control}
          name="syncOptions.fieldMappings.caCertificate"
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                CA Certificate Field
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    {`The field name used to store the CA certificate content in the ${currentDestination === PkiSync.Chef ? "Chef data bag item" : "AWS secret"}.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input {...field} placeholder="ca_certificate" isError={Boolean(error)} />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
      </div>

      <div className="mt-6 rounded-lg border border-border bg-container p-4">
        <h4 className="mb-2 text-sm font-medium text-foreground">Preview JSON Structure</h4>
        <pre className="text-xs text-muted">
          {`{
  "id": "certificate-item-name",
  "${watch("syncOptions.fieldMappings.certificate") || "certificate"}": "<certificate-content>",
  "${watch("syncOptions.fieldMappings.privateKey") || "private_key"}": "<private-key-content>",
  "${watch("syncOptions.fieldMappings.certificateChain") || "certificate_chain"}": "<certificate-chain-content>",
  "${watch("syncOptions.fieldMappings.caCertificate") || "ca_certificate"}": "<ca-certificate-content>"
}`}
        </pre>
      </div>
    </>
  );
};
