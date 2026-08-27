import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  Field,
  FieldError,
  FieldLabel,
  Input,
  SecretInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import {
  LogProvider,
  REDACTED_CREDENTIAL_VALUE,
  SPLUNK_CLOUD_HEC_PORT,
  SPLUNK_ENTERPRISE_HEC_PORT
} from "@app/hooks/api/auditLogStreams/enums";
import { TSplunkProviderLogStream } from "@app/hooks/api/auditLogStreams/types/providers/splunk-provider";

import { AuditLogStreamFormFooter } from "./AuditLogStreamFormFooter";
import { auditLogStreamFiltersSchema, ProductsField } from "./AuditLogStreamProductsField";

type Props = {
  auditLogStream?: TSplunkProviderLogStream;
  onSubmit: (formData: FormData) => void;
};

const formSchema = z.object({
  provider: z.literal(LogProvider.Splunk),
  credentials: z.object({
    hostname: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .superRefine((val, ctx) => {
        if (val.includes("://")) {
          ctx.addIssue({
            code: "custom",
            message: "Hostname should not include protocol"
          });
          return;
        }

        try {
          const url = new URL(`https://${val}`);
          if (url.hostname !== val) {
            ctx.addIssue({
              code: "custom",
              message: "Must be a valid hostname without port or path"
            });
          }
        } catch {
          ctx.addIssue({ code: "custom", message: "Invalid hostname" });
        }
      }),
    port: z.union([z.literal(SPLUNK_ENTERPRISE_HEC_PORT), z.literal(SPLUNK_CLOUD_HEC_PORT)]),
    token: z.string().uuid().trim().min(1)
  }),
  ...auditLogStreamFiltersSchema.shape
});

type FormData = z.infer<typeof formSchema>;

export const SplunkProviderAuditLogStreamForm = ({ auditLogStream, onSubmit }: Props) => {
  const isUpdate = Boolean(auditLogStream);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: auditLogStream
      ? {
          ...auditLogStream,
          credentials: {
            ...auditLogStream.credentials,
            port: auditLogStream.credentials.port ?? SPLUNK_ENTERPRISE_HEC_PORT
          }
        }
      : {
          provider: LogProvider.Splunk,
          credentials: { port: SPLUNK_ENTERPRISE_HEC_PORT }
        }
  });

  const { handleSubmit, control } = form;

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Controller
            name="credentials.hostname"
            control={control}
            shouldUnregister
            render={({ field, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel htmlFor="hostname">Hostname</FieldLabel>
                <Input
                  id="hostname"
                  {...field}
                  placeholder="splunk.example.com"
                  isError={Boolean(error?.message)}
                />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
          <Controller
            name="credentials.port"
            control={control}
            shouldUnregister
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel htmlFor="port">Port</FieldLabel>
                <Select
                  value={String(value ?? SPLUNK_ENTERPRISE_HEC_PORT)}
                  onValueChange={(val) => onChange(Number(val))}
                >
                  <SelectTrigger id="port" className="!w-24" isError={Boolean(error?.message)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value={String(SPLUNK_ENTERPRISE_HEC_PORT)}>
                      {SPLUNK_ENTERPRISE_HEC_PORT}
                    </SelectItem>
                    <SelectItem value={String(SPLUNK_CLOUD_HEC_PORT)}>
                      {SPLUNK_CLOUD_HEC_PORT}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        </div>
        <Controller
          name="credentials.token"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="token">Splunk Token</FieldLabel>
              <SecretInput
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={() => {
                  // On edit the field is prefilled with the redacted sentinel; clear it on focus
                  // so the user types a fresh value instead of editing the placeholder.
                  if (
                    auditLogStream?.credentials.token === REDACTED_CREDENTIAL_VALUE &&
                    value === REDACTED_CREDENTIAL_VALUE
                  ) {
                    onChange("");
                  }
                }}
                onBlur={() => {
                  // Left untouched: restore the sentinel so submitting keeps the existing secret.
                  if (
                    auditLogStream?.credentials.token === REDACTED_CREDENTIAL_VALUE &&
                    value === ""
                  ) {
                    onChange(REDACTED_CREDENTIAL_VALUE);
                  }
                }}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <ProductsField />
        <AuditLogStreamFormFooter submitLabel={isUpdate ? "Update" : "Create Log Stream"} />
      </form>
    </FormProvider>
  );
};
