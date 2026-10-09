import { useMemo } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import {
  Field,
  FieldDescription,
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
import { useServerConfig } from "@app/context";
import {
  APP_CONNECTION_MAP,
  getAppConnectionMethodDetails,
  getS3CompatibleProviderName
} from "@app/helpers/appConnections";
import { TS3CompatibleConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { S3CompatibleConnectionMethod } from "@app/hooks/api/appConnections/types/s3-compatible-connection";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TS3CompatibleConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.S3Compatible)
});

const buildFormSchema = (allowedStorageHostnames: string[]) =>
  z.discriminatedUnion("method", [
    rootSchema.extend({
      method: z.literal(S3CompatibleConnectionMethod.AccessKey),
      credentials: z.object({
        endpoint: z
          .string()
          .trim()
          .min(1, "Endpoint required")
          .refine(
            (endpoint) => Boolean(getS3CompatibleProviderName(endpoint, allowedStorageHostnames)),
            "Enter the S3 API endpoint of a supported provider, without the bucket name"
          ),
        accessKeyId: z.string().trim().min(1, "Access Key ID required"),
        secretAccessKey: z.string().trim().min(1, "Secret Access Key required")
      })
    })
  ]);

type FormData = z.infer<ReturnType<typeof buildFormSchema>>;

export const S3CompatibleConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const { config } = useServerConfig();
  const allowedStorageHostnames = useMemo(
    () => config.allowedStorageHostnames ?? [],
    [config.allowedStorageHostnames]
  );
  const formSchema = useMemo(
    () => buildFormSchema(allowedStorageHostnames),
    [allowedStorageHostnames]
  );
  const supportedEndpoints = new Intl.ListFormat("en").format([
    "AWS S3",
    "Cloudflare R2",
    "Google Cloud Storage",
    "OCI Object Storage",
    ...allowedStorageHostnames
  ]);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.S3Compatible,
      method: S3CompatibleConnectionMethod.AccessKey,
      credentials: {
        endpoint: "",
        accessKeyId: "",
        secretAccessKey: ""
      }
    }
  });

  const { handleSubmit, control } = form;

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
                    {APP_CONNECTION_MAP[AppConnection.S3Compatible].name}. This field cannot be
                    changed after creation.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(S3CompatibleConnectionMethod).map((method) => {
                    return (
                      <SelectItem value={method} key={method}>
                        {getAppConnectionMethodDetails(method).name}{" "}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.endpoint"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="endpoint">Endpoint</FieldLabel>
              <Input
                id="endpoint"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="https://s3.us-east-1.amazonaws.com"
                isError={Boolean(error?.message)}
              />
              <FieldDescription>
                The S3 API endpoint, without the bucket name. Supports {supportedEndpoints}.
              </FieldDescription>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.accessKeyId"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="access-key-id">Access Key ID</FieldLabel>
              <Input
                id="access-key-id"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.secretAccessKey"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="secret-access-key">Secret Access Key</FieldLabel>
              <SecretInput
                aria-describedby={error ? "secret-access-key-error" : undefined}
                id="secret-access-key"
                isError={Boolean(error)}
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
              <FieldError id="secret-access-key-error" errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter
          submitLabel={
            isUpdate
              ? "Update Credentials"
              : `Connect to ${APP_CONNECTION_MAP[AppConnection.S3Compatible].name}`
          }
        />
      </form>
    </FormProvider>
  );
};
