import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  SecretInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { LogProvider } from "@app/hooks/api/auditLogStreams/enums";
import { TDatadogProviderLogStream } from "@app/hooks/api/auditLogStreams/types/providers/datadog-provider";

import { AuditLogStreamFormFooter } from "./AuditLogStreamFormFooter";
import { auditLogStreamFiltersSchema, ProductsField } from "./AuditLogStreamProductsField";

type Props = {
  auditLogStream?: TDatadogProviderLogStream;
  onSubmit: (formData: FormData) => void;
};

const formSchema = z.object({
  provider: z.literal(LogProvider.Datadog),
  credentials: z.object({
    url: z.string().url().trim().min(1).max(255),
    token: z
      .string()
      .trim()
      .regex(/^[a-fA-F0-9]{32}$/, "Invalid Datadog API key format")
  }),
  ...auditLogStreamFiltersSchema.shape
});

type FormData = z.infer<typeof formSchema>;

const DATADOG_ENDPOINTS = {
  "Datadog US1": "https://http-intake.logs.datadoghq.com/api/v2/logs",
  "Datadog US3": "https://http-intake.logs.us3.datadoghq.com/api/v2/logs",
  "Datadog US5": "https://http-intake.logs.us5.datadoghq.com/api/v2/logs",
  "Datadog EU": "https://http-intake.logs.datadoghq.eu/api/v2/logs",
  "Datadog AP1": "https://http-intake.logs.ap1.datadoghq.com/api/v2/logs",
  "Datadog AP2": "https://http-intake.logs.ap2.datadoghq.com/api/v2/logs",
  "Datadog GovCloud (US1-FED)": "https://http-intake.logs.ddog-gov.com/api/v2/logs"
};

export const DatadogProviderAuditLogStreamForm = ({ auditLogStream, onSubmit }: Props) => {
  const isUpdate = Boolean(auditLogStream);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: auditLogStream ?? {
      provider: LogProvider.Datadog,
      credentials: {
        url: DATADOG_ENDPOINTS["Datadog US1"]
      }
    }
  });

  const { handleSubmit, control } = form;

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Controller
          name="credentials.url"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="datadog-region">Datadog Region</FieldLabel>
              <Select value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger
                  id="datadog-region"
                  className="w-full"
                  isError={Boolean(error?.message)}
                >
                  <SelectValue placeholder="Select a region" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.entries(DATADOG_ENDPOINTS).map(([k, v]) => (
                    <SelectItem value={v} key={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!error && value && <FieldDescription>{value}</FieldDescription>}
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.token"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="datadog-token">Datadog Token</FieldLabel>
              <SecretInput value={value} onChange={(e) => onChange(e.target.value)} />
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
