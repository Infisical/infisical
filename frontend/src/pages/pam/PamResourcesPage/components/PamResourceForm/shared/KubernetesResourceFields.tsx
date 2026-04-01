import { Controller, useFormContext } from "react-hook-form";
import { InfoIcon } from "lucide-react";

import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Label,
  Switch,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableInput
} from "@app/components/v3";

export const KubernetesResourceFields = () => {
  const { control } = useFormContext();

  return (
    <div className="flex flex-col gap-3">
      <Label>Connection</Label>

      <Controller
        name="connectionDetails.url"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Kubernetes API URL</FieldLabel>
            <FieldContent>
              <UnstableInput
                {...field}
                isError={Boolean(error)}
                placeholder="https://kubernetes.example.com:6443"
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="connectionDetails.sslCertificate"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>CA Certificate</FieldLabel>
            <FieldContent>
              <TextArea {...field} placeholder="-----BEGIN CERTIFICATE-----..." />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="connectionDetails.sslRejectUnauthorized"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field orientation="horizontal">
            <FieldLabel>
              Reject Unauthorized
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
                </TooltipTrigger>
                <TooltipContent>
                  If enabled, Infisical will only connect to the server if it has a valid, trusted
                  SSL certificate.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <Switch variant="project" checked={value} onCheckedChange={onChange} />
            <FieldError errors={[error]} />
          </Field>
        )}
      />
    </div>
  );
};
