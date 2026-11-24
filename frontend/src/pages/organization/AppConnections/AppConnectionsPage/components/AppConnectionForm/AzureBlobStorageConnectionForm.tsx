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
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { TAzureBlobStorageConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { AzureBlobStorageConnectionMethod } from "@app/hooks/api/appConnections/types/azure-blob-storage-connection";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TAzureBlobStorageConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const LOWERCASE_ALPHANUMERIC = "abcdefghijklmnopqrstuvwxyz0123456789";

const accountNameSchema = z
  .string()
  .trim()
  .min(3, "Storage account name must be at least 3 characters")
  .max(24, "Storage account name cannot exceed 24 characters")
  .refine(
    (name) => [...name].every((char) => LOWERCASE_ALPHANUMERIC.includes(char)),
    "Storage account name can only contain lowercase letters and numbers"
  );

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.AzureBlobStorage)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(AzureBlobStorageConnectionMethod.ClientSecret),
    credentials: z.object({
      accountName: accountNameSchema,
      tenantId: z.string().trim().uuid("Tenant ID must be a UUID"),
      clientId: z.string().trim().uuid("Client ID must be a UUID"),
      clientSecret: z.string().trim().min(1, "Client Secret required")
    })
  }),
  rootSchema.extend({
    method: z.literal(AzureBlobStorageConnectionMethod.AccessKey),
    credentials: z.object({
      accountName: accountNameSchema,
      accountKey: z.string().trim().min(1, "Account Key required")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const AzureBlobStorageConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.AzureBlobStorage,
      method: AzureBlobStorageConnectionMethod.ClientSecret,
      credentials: {
        accountName: "",
        tenantId: "",
        clientId: "",
        clientSecret: ""
      }
    }
  });

  const { handleSubmit, control, watch } = form;
  const method = watch("method");

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
                    {APP_CONNECTION_MAP[AppConnection.AzureBlobStorage].name}. This field cannot be
                    changed after creation.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(AzureBlobStorageConnectionMethod).map((option) => (
                    <SelectItem value={option} key={option}>
                      {getAppConnectionMethodDetails(option).name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.accountName"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="account-name">Storage Account Name</FieldLabel>
              <Input
                id="account-name"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="mystorageaccount"
                isError={Boolean(error?.message)}
              />
              <FieldDescription>
                The name in https://&lt;account&gt;.blob.core.windows.net.
              </FieldDescription>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        {method === AzureBlobStorageConnectionMethod.ClientSecret ? (
          <>
            <Controller
              name="credentials.tenantId"
              control={control}
              shouldUnregister
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="tenant-id">Tenant ID</FieldLabel>
                  <Input
                    id="tenant-id"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
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
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="client-id">Client ID</FieldLabel>
                  <Input
                    id="client-id"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
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
                  <FieldLabel htmlFor="client-secret">Client Secret</FieldLabel>
                  <SecretInput
                    id="client-secret"
                    isError={Boolean(error)}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                  />
                  <FieldDescription>
                    The app registration needs the Storage Blob Data Contributor role on the storage
                    account.
                  </FieldDescription>
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </>
        ) : (
          <Controller
            name="credentials.accountKey"
            control={control}
            shouldUnregister
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel htmlFor="account-key">Account Key</FieldLabel>
                <SecretInput
                  id="account-key"
                  isError={Boolean(error)}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        )}
        <AppConnectionFormFooter
          submitLabel={
            isUpdate
              ? "Update Credentials"
              : `Connect to ${APP_CONNECTION_MAP[AppConnection.AzureBlobStorage].name}`
          }
        />
      </form>
    </FormProvider>
  );
};
