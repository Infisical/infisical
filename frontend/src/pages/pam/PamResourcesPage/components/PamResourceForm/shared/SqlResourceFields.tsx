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

export const SqlResourceFields = () => {
  const { control, watch } = useFormContext();

  const sslEnabled = watch("connectionDetails.sslEnabled");
  return (
    <>
      {/* Connection */}
      <div className="flex flex-col gap-3">
        <Label>Connection</Label>

        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <Controller
            name="connectionDetails.host"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Host</FieldLabel>
                <FieldContent>
                  <UnstableInput {...field} placeholder="db.example.com" isError={Boolean(error)} />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            name="connectionDetails.database"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <Field>
                <FieldLabel>Database Name</FieldLabel>
                <FieldContent>
                  <UnstableInput {...field} isError={Boolean(error)} />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
          <Controller
            name="connectionDetails.port"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <Field className="w-24">
                <FieldLabel>Port</FieldLabel>
                <FieldContent>
                  <UnstableInput type="number" {...field} isError={Boolean(error)} />
                  <FieldError errors={[error]} />
                </FieldContent>
              </Field>
            )}
          />
        </div>
      </div>

      {/* SSL */}
      <div className="flex flex-col gap-3">
        <Label>SSL</Label>

        <Controller
          name="connectionDetails.sslEnabled"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field orientation="horizontal">
              <FieldLabel>Enable SSL</FieldLabel>
              <Switch variant="project" checked={value} onCheckedChange={onChange} />
              <FieldError errors={[error]} />
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
                <TextArea
                  {...field}
                  placeholder="-----BEGIN CERTIFICATE-----..."
                  disabled={!sslEnabled}
                />
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
                  <TooltipTrigger>
                    <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
                  </TooltipTrigger>
                  <TooltipContent>
                    If enabled, Infisical will only connect to the server if it has a valid, trusted
                    SSL certificate.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Switch
                variant="project"
                disabled={!sslEnabled}
                checked={sslEnabled ? value : false}
                onCheckedChange={onChange}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
      </div>
    </>
  );
};
