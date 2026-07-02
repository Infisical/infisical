import { useState } from "react";
import { Controller, FormProvider, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CircleHelp, Plus, Trash2 } from "lucide-react";
import { z } from "zod";

import {
  Button,
  Field,
  FieldError,
  FieldLabel,
  IconButton,
  Input,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useScopeVariant } from "@app/hooks";
import {
  LogProvider,
  REDACTED_CREDENTIAL_VALUE,
  StreamMode
} from "@app/hooks/api/auditLogStreams/enums";
import { TCustomProviderLogStream } from "@app/hooks/api/auditLogStreams/types/providers/custom-provider";

import { AuditLogStreamFormFooter } from "./AuditLogStreamFormFooter";
import { auditLogStreamFiltersSchema, ProductsField } from "./AuditLogStreamProductsField";

type Props = {
  auditLogStream?: TCustomProviderLogStream;
  onSubmit: (formData: FormData) => void;
};

const formSchema = z.object({
  provider: z.literal(LogProvider.Custom),
  credentials: z.object({
    url: z.string().url().trim().min(1).max(255),
    headers: z
      .object({
        key: z.string().min(1, "Required"),
        value: z.string().min(1, "Required")
      })
      .array()
  }),
  streamMode: z.nativeEnum(StreamMode).optional(),
  ...auditLogStreamFiltersSchema.shape
});

type FormData = z.infer<typeof formSchema>;

export const CustomProviderAuditLogStreamForm = ({ auditLogStream, onSubmit }: Props) => {
  const [showPassword, setShowPassword] = useState(false);

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
          provider: LogProvider.Custom,
          credentials: { headers: [] }
        }
  });

  const { handleSubmit, control } = form;

  const headerFields = useFieldArray({
    control,
    name: "credentials.headers"
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Controller
          name="credentials.url"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="custom-url">Endpoint URL</FieldLabel>
              <Input
                id="custom-url"
                {...field}
                placeholder="https://example.com"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />

        <FieldLabel className="mb-2">
          Headers <span className="text-muted">(optional)</span>
        </FieldLabel>
        {headerFields.fields.map(({ id: headerFieldId }, i) => (
          <div key={headerFieldId} className="flex items-start gap-2">
            <Controller
              control={control}
              name={`credentials.headers.${i}.key`}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-2 w-1/3">
                  <Input {...field} placeholder="Authorization" isError={Boolean(error?.message)} />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              control={control}
              name={`credentials.headers.${i}.value`}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-2 grow">
                  <Input
                    {...field}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Bearer <token>"
                    isError={Boolean(error?.message)}
                    onFocus={() => {
                      if (
                        auditLogStream &&
                        auditLogStream.credentials.headers[i] &&
                        auditLogStream.credentials.headers[i].value === REDACTED_CREDENTIAL_VALUE &&
                        field.value === REDACTED_CREDENTIAL_VALUE
                      ) {
                        field.onChange("");
                      }
                      setShowPassword(true);
                    }}
                    onBlur={() => {
                      if (
                        auditLogStream &&
                        auditLogStream.credentials.headers[i] &&
                        auditLogStream.credentials.headers[i].value === REDACTED_CREDENTIAL_VALUE &&
                        field.value === ""
                      ) {
                        field.onChange(REDACTED_CREDENTIAL_VALUE);
                      }
                      setShowPassword(false);
                    }}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <IconButton
                  aria-label="delete key"
                  variant="outline"
                  className="hover:text-danger"
                  onClick={() => headerFields.remove(i)}
                >
                  <Trash2 />
                </IconButton>
              </TooltipTrigger>
              <TooltipContent>Remove header</TooltipContent>
            </Tooltip>
          </div>
        ))}
        <Button
          variant="outline"
          size="xs"
          className="mb-4"
          onClick={() => headerFields.append({ value: "", key: "" })}
        >
          <Plus />
          Add Key
        </Button>
        {isUpdate && (
          <Controller
            control={control}
            name="streamMode"
            render={({ field }) => {
              const isBatch = field.value === StreamMode.Batch;
              return (
                <div className="mb-4">
                  <Field orientation="horizontal">
                    <FieldLabel htmlFor="stream-batch-mode" className="text-sm">
                      Batch delivery
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <CircleHelp />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md">
                          Send events as a JSON array.
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
                        endpoint accepts a JSON array of events.
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-muted">
                        This stream uses legacy single-event delivery (one event per request).
                        Enable batch delivery to send events as a JSON array.
                      </p>
                    ))}
                </div>
              );
            }}
          />
        )}
        <ProductsField />
        <AuditLogStreamFormFooter submitLabel={isUpdate ? "Update" : "Create Log Stream"} />
      </form>
    </FormProvider>
  );
};
