import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Field, FieldError, FieldLabel, Input, SecretInput } from "@app/components/v3";
import { LogProvider } from "@app/hooks/api/auditLogStreams/enums";
import { TAzureProviderLogStream } from "@app/hooks/api/auditLogStreams/types/providers/azure-provider";

import { AuditLogStreamFormFooter } from "./AuditLogStreamFormFooter";
import { auditLogStreamFiltersSchema, ProductsField } from "./AuditLogStreamProductsField";

type Props = {
  auditLogStream?: TAzureProviderLogStream;
  onSubmit: (formData: FormData) => void;
};

const formSchema = z.object({
  provider: z.literal(LogProvider.Azure),
  credentials: z.object({
    tenantId: z.string().trim().uuid(),
    clientId: z.string().trim().uuid(),
    clientSecret: z.string().trim().length(40),
    dceUrl: z.string().trim().url().min(1).max(255),
    dcrId: z
      .string()
      .trim()
      .regex(/^dcr-[0-9a-f]{32}$/, "DCR ID must be in dcr-*** format"),
    cltName: z.string().trim().min(1).max(255)
  }),
  ...auditLogStreamFiltersSchema.shape
});

type FormData = z.infer<typeof formSchema>;

export const AzureProviderAuditLogStreamForm = ({ auditLogStream, onSubmit }: Props) => {
  const isUpdate = Boolean(auditLogStream);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: auditLogStream ?? {
      provider: LogProvider.Azure
    }
  });

  const { handleSubmit, control } = form;

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Controller
          name="credentials.tenantId"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="tenantId">Tenant ID</FieldLabel>
              <Input
                id="tenantId"
                {...field}
                placeholder="00000000-0000-0000-0000-000000000000"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.clientId"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="clientId">Client ID</FieldLabel>
              <Input
                id="clientId"
                {...field}
                placeholder="00000000-0000-0000-0000-000000000000"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.clientSecret"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="clientSecret">Client Secret</FieldLabel>
              <SecretInput value={value} onChange={(e) => onChange(e.target.value)} />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.dceUrl"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="dceUrl">Data Collection Endpoint URL</FieldLabel>
              <Input
                id="dceUrl"
                {...field}
                placeholder="https://example.eastus-1.ingest.monitor.azure.com"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.dcrId"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="dcrId">Data Collection Rule Immutable ID</FieldLabel>
              <Input
                id="dcrId"
                {...field}
                placeholder="dcr-00000000000000000000000000000000"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.cltName"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="cltName">Custom Log Table Name</FieldLabel>
              <Input
                id="cltName"
                {...field}
                placeholder="InfisicalLogs"
                isError={Boolean(error?.message)}
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
