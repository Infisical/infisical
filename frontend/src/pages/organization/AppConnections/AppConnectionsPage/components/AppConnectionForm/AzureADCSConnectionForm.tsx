import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Label,
  SecretInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { useScopeVariant } from "@app/hooks";
import { AzureADCSConnectionMethod, TAzureADCSConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TAzureADCSConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.AzureADCS)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(AzureADCSConnectionMethod.UsernamePassword),
    credentials: z.object({
      adcsUrl: z
        .string()
        .trim()
        .min(1, "ADCS URL required")
        .refine((value) => value.startsWith("https://"), "ADCS URL must use HTTPS"),
      username: z.string().trim().min(1, "Username required"),
      password: z.string().trim().min(1, "Password required"),
      sslRejectUnauthorized: z.boolean().optional(),
      sslCertificate: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .optional()
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const AzureADCSConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [selectedTab, setSelectedTab] = useState("configuration");

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.AzureADCS,
      method: AzureADCSConnectionMethod.UsernamePassword,
      name: "",
      description: "",
      credentials: {
        adcsUrl: "",
        username: "",
        password: "",
        sslRejectUnauthorized: true,
        sslCertificate: undefined
      }
    }
  });

  const { handleSubmit, control, watch } = form;

  const scopeVariant = useScopeVariant();

  const sslEnabled = watch("credentials.adcsUrl")?.startsWith("https://") ?? false;

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(e) => {
          setSelectedTab("configuration");
          handleSubmit(onSubmit)(e);
        }}
      >
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
                      APP_CONNECTION_MAP[AppConnection.AzureADCS].name
                    }. This field cannot be changed after creation.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(AzureADCSConnectionMethod).map((method) => {
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
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="mb-4">
          <TabsList variant={scopeVariant}>
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
            <TabsTrigger value="ssl">SSL ({sslEnabled ? "Enabled" : "Disabled"})</TabsTrigger>
          </TabsList>
          <TabsContent value="configuration">
            <Controller
              name="credentials.adcsUrl"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="adcs-url">ADCS URL</FieldLabel>
                  <Input
                    id="adcs-url"
                    {...field}
                    placeholder="https://your-adcs-server.com"
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
                render={({ field, fieldState: { error } }) => (
                  <Field className="mb-4">
                    <FieldLabel htmlFor="username">Username</FieldLabel>
                    <Input
                      id="username"
                      {...field}
                      placeholder="DOMAIN\\username or user@domain.com"
                      isError={Boolean(error?.message)}
                    />
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
              <Controller
                name="credentials.password"
                control={control}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <Field className="mb-4">
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <SecretInput value={value} onChange={(e) => onChange(e.target.value)} />
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
            </div>
          </TabsContent>
          <TabsContent value="ssl">
            <p className="mb-3 text-xs text-muted">SSL configuration for HTTPS connections</p>
            <Controller
              name="credentials.sslCertificate"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className={sslEnabled ? "mb-4" : "mb-4 opacity-50"}>
                  <FieldLabel htmlFor="ssl-certificate">
                    SSL Certificate <span className="text-muted">(optional)</span>
                  </FieldLabel>
                  <TextArea
                    id="ssl-certificate"
                    className="h-[3.6rem] resize-none!"
                    {...field}
                    disabled={!sslEnabled}
                    isError={Boolean(error?.message)}
                    placeholder="-----BEGIN CERTIFICATE-----
...
-----END CERTIFICATE-----"
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.sslRejectUnauthorized"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className={sslEnabled ? undefined : "opacity-50"}>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <Label htmlFor="ssl-reject-unauthorized">Reject Unauthorized</Label>
                      <FieldDescription>
                        If enabled, Infisical will only connect to the ADCS server if it has a
                        valid, trusted SSL certificate. Disable only in test environments with
                        self-signed certificates.
                      </FieldDescription>
                    </FieldContent>
                    <Switch
                      id="ssl-reject-unauthorized"
                      variant={scopeVariant}
                      checked={sslEnabled ? value : false}
                      onCheckedChange={onChange}
                      disabled={!sslEnabled}
                    />
                  </Field>
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </TabsContent>
        </Tabs>
        <AppConnectionFormFooter
          submitLabel={isUpdate ? "Update Credentials" : "Connect to Azure ADCS"}
        />
      </form>
    </FormProvider>
  );
};
