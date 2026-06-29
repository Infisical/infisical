import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleHelp, Info } from "lucide-react";
import { z } from "zod";

import {
  Field,
  FieldError,
  FieldLabel,
  Input,
  SecretInput,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useScopeVariant } from "@app/hooks";
import { LogProvider, StreamMode } from "@app/hooks/api/auditLogStreams/enums";
import { TCriblProviderLogStream } from "@app/hooks/api/auditLogStreams/types/providers/cribl-provider";

import { AuditLogStreamFormFooter } from "./AuditLogStreamFormFooter";
import { auditLogStreamFiltersSchema, ProductsField } from "./AuditLogStreamProductsField";

type Props = {
  auditLogStream?: TCriblProviderLogStream;
  onSubmit: (formData: FormData) => void;
};

const formSchema = z.object({
  provider: z.literal(LogProvider.Cribl),
  credentials: z.object({
    url: z.string().url().trim().min(1).max(255),
    token: z.string().trim().min(21).max(255)
  }),
  streamMode: z.nativeEnum(StreamMode).optional(),
  ...auditLogStreamFiltersSchema.shape
});

type FormData = z.infer<typeof formSchema>;

export const CriblProviderAuditLogStreamForm = ({ auditLogStream, onSubmit }: Props) => {
  const isUpdate = Boolean(auditLogStream);
  // Only streams already on "single" (legacy) can change mode — and only to "batch".
  const isSingleStream = auditLogStream?.streamMode === StreamMode.Single;
  const scopeVariant = useScopeVariant();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: auditLogStream
      ? {
          ...auditLogStream,
          // Any payload missing streamMode (legacy stream, partial cache) resolves to
          // Batch — the system default — so the switch reflects the true mode rather
          // than rendering unchecked.
          streamMode: auditLogStream.streamMode ?? StreamMode.Batch
        }
      : {
          provider: LogProvider.Cribl
        }
  });

  const { handleSubmit, control } = form;

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Controller
          name="credentials.url"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="cribl-url">
                Cribl Stream URL
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    To derive your Stream URL: Obtain your Cribl hostname (e.g. cribl.example.com),
                    Infisical HTTP data source port (e.g. 20000), and HTTP event API path (e.g.
                    /infisical).
                    <br />
                    <br />
                    If your Infisical Data Source has TLS enabled, then use the https protocol.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="cribl-url"
                {...field}
                placeholder="http://default.main.example.cribl.cloud:20000/infisical/_bulk"
                isError={Boolean(error?.message)}
              />
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
              <FieldLabel htmlFor="cribl-token">Cribl Stream Token</FieldLabel>
              <SecretInput value={value} onChange={(e) => onChange(e.target.value)} />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        {isUpdate && (
          <div className="mt-6">
            <Controller
              control={control}
              name="streamMode"
              render={({ field }) => {
                const isBatch = field.value === StreamMode.Batch;
                return (
                  <div>
                    <Field orientation="horizontal">
                      <FieldLabel htmlFor="stream-batch-mode" className="text-sm">
                        Batch delivery
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <CircleHelp />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-md">
                            Send events as a newline-delimited JSON (NDJSON) batch.
                          </TooltipContent>
                        </Tooltip>
                      </FieldLabel>
                      <Switch
                        id="stream-batch-mode"
                        variant={scopeVariant}
                        checked={isBatch}
                        disabled={!isSingleStream}
                        onCheckedChange={(checked) =>
                          field.onChange(checked ? StreamMode.Batch : StreamMode.Single)
                        }
                      />
                    </Field>
                    {isSingleStream &&
                      (isBatch ? (
                        <p className="mt-2 text-xs text-warning">
                          Switching from single to batch delivery cannot be undone. Make sure your
                          Cribl source accepts newline-delimited JSON (NDJSON) batches.
                        </p>
                      ) : (
                        <p className="mt-2 text-xs text-muted">
                          This stream uses legacy single-event delivery (one event per request).
                          Enable batch delivery to send events as a newline-delimited JSON (NDJSON)
                          batch.
                        </p>
                      ))}
                  </div>
                );
              }}
            />
          </div>
        )}

        <div className="mt-6">
          <ProductsField />
        </div>

        <AuditLogStreamFormFooter
          submitLabel={isUpdate ? "Update" : "Create Log Stream"}
        />
      </form>
    </FormProvider>
  );
};
