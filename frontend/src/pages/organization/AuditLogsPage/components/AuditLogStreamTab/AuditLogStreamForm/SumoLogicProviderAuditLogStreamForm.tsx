import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import {
  Field,
  FieldError,
  FieldLabel,
  Input,
  SecretInput,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { LogProvider, REDACTED_CREDENTIAL_VALUE } from "@app/hooks/api/auditLogStreams/enums";
import { TSumoLogicProviderLogStream } from "@app/hooks/api/auditLogStreams/types/providers/sumo-logic-provider";

import { AuditLogStreamFormFooter } from "./AuditLogStreamFormFooter";
import { auditLogStreamFiltersSchema, ProductsField } from "./AuditLogStreamProductsField";

type Props = {
  auditLogStream?: TSumoLogicProviderLogStream;
  onSubmit: (formData: FormData) => void;
};

const formSchema = z.object({
  provider: z.literal(LogProvider.SumoLogic),
  credentials: z.object({
    url: z.string().url().trim().min(1).max(255),
    token: z.string().trim().min(1).max(255)
  }),
  ...auditLogStreamFiltersSchema.shape
});

type FormData = z.infer<typeof formSchema>;

export const SumoLogicProviderAuditLogStreamForm = ({ auditLogStream, onSubmit }: Props) => {
  const isUpdate = Boolean(auditLogStream);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: auditLogStream ?? {
      provider: LogProvider.SumoLogic
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
              <FieldLabel htmlFor="sumo-logic-url">
                HTTP Source Address
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The HTTP Source Address from your Sumo Logic HTTP Logs and Metrics Source.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="sumo-logic-url"
                {...field}
                placeholder="https://endpoint.collection.sumologic.com/receiver/v1/http"
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
              <FieldLabel htmlFor="sumo-logic-token">
                Auth Token
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The collector token from your HTTP Source&apos;s <code>x-sumo-token</code>{" "}
                    header (the value after <code>x-sumo-token: </code>
                    ). Infisical sends it as the <code>x-sumo-token</code> header on each request.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
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
