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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  DatadogConnectionMethod,
  TDatadogConnection
} from "@app/hooks/api/appConnections/types/datadog-connection";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TDatadogConnection;
  onSubmit: (formData: FormData) => void;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Datadog)
});

const urlSchema = z.string().trim().url("Invalid Datadog URL").min(1, "URL required").max(255);

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(DatadogConnectionMethod.Token),
    credentials: z.object({
      url: urlSchema,
      token: z.string().trim().min(1, "Token required")
    })
  }),
  rootSchema.extend({
    method: z.literal(DatadogConnectionMethod.ApiKey),
    credentials: z.object({
      url: urlSchema,
      apiKey: z.string().trim().min(1, "API Key required"),
      applicationKey: z.string().trim().min(1, "Application Key required")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const DatadogConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.Datadog,
      method: DatadogConnectionMethod.Token
    }
  });

  const { handleSubmit, control, watch } = form;

  const selectedMethod = watch("method");

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}

        <Controller
          name="method"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="method">
                Method
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The method you would like to use to connect with{" "}
                    {APP_CONNECTION_MAP[AppConnection.Datadog].name}. This field cannot be changed
                    after creation.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(DatadogConnectionMethod).map((method) => (
                    <SelectItem value={method} key={method}>
                      {getAppConnectionMethodDetails(method).name}
                      {method === DatadogConnectionMethod.Token ? " (Recommended)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />

        <Controller
          name="credentials.url"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="url">
                Datadog URL
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The Datadog site URL to connect to (e.g., https://api.datadoghq.com).
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="url"
                {...field}
                placeholder="https://api.datadoghq.com"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />

        {selectedMethod === DatadogConnectionMethod.Token ? (
          <Controller
            name="credentials.token"
            control={control}
            shouldUnregister
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel htmlFor="token">API Token</FieldLabel>
                <SecretInput value={value} onChange={(e) => onChange(e.target.value)} />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        ) : (
          <>
            <Controller
              name="credentials.apiKey"
              control={control}
              shouldUnregister
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="api-key">API Key</FieldLabel>
                  <SecretInput value={value} onChange={(e) => onChange(e.target.value)} />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.applicationKey"
              control={control}
              shouldUnregister
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="application-key">Application Key</FieldLabel>
                  <SecretInput value={value} onChange={(e) => onChange(e.target.value)} />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </>
        )}

        <AppConnectionFormFooter
          submitLabel={isUpdate ? "Update Credentials" : "Connect to Datadog"}
        />
      </form>
    </FormProvider>
  );
};
