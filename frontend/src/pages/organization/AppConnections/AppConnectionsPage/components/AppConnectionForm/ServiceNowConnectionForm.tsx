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
import { TServiceNowConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { ServiceNowConnectionMethod } from "@app/hooks/api/appConnections/types/servicenow-connection";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TServiceNowConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.ServiceNow)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(ServiceNowConnectionMethod.BasicAuth),
    credentials: z.object({
      instanceUrl: z
        .string()
        .trim()
        .url("Invalid instance URL")
        .max(512, "Instance URL cannot exceed 512 characters")
        .refine((value) => {
          const { pathname, search, hash } = new URL(value);
          return (pathname === "" || pathname === "/") && !search && !hash;
        }, "Enter the base URL of your instance, without a path"),
      username: z
        .string()
        .trim()
        .min(1, "Username is required")
        .max(256, "Username cannot exceed 256 characters"),
      password: z
        .string()
        .trim()
        .min(1, "Password is required")
        .max(512, "Password cannot exceed 512 characters")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const ServiceNowConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.ServiceNow,
      method: ServiceNowConnectionMethod.BasicAuth,
      credentials: {
        instanceUrl: "",
        username: "",
        password: ""
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
              <FieldLabel>
                Method
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    {`The method you would like to use to connect with ${
                      APP_CONNECTION_MAP[AppConnection.ServiceNow].name
                    }. This field cannot be changed after creation.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(ServiceNowConnectionMethod).map((method) => {
                    return (
                      <SelectItem value={method} key={method}>
                        {getAppConnectionMethodDetails(method).name}
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
          name="credentials.instanceUrl"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="instance-url">Instance URL</FieldLabel>
              <Input
                id="instance-url"
                {...field}
                placeholder="https://dev12345.service-now.com"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <div className="grid grid-cols-2 gap-2">
          <Controller
            name="credentials.username"
            control={control}
            shouldUnregister
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel htmlFor="credentials-username">Username</FieldLabel>
                <Input
                  id="credentials-username"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder="infisical.integration"
                  isError={Boolean(error?.message)}
                />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
          <Controller
            name="credentials.password"
            control={control}
            shouldUnregister
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel>Password</FieldLabel>
                <SecretInput value={value} onChange={(e) => onChange(e.target.value)} />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        </div>
        <AppConnectionFormFooter
          submitLabel={isUpdate ? "Update Credentials" : "Connect to ServiceNow"}
        />
      </form>
    </FormProvider>
  );
};
