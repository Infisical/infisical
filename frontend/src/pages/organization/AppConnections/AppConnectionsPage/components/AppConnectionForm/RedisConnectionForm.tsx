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
import { RedisConnectionMethod, TRedisConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TRedisConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Redis)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(RedisConnectionMethod.UsernameAndPassword),
    credentials: z.object({
      host: z.string().trim().min(1, "Host required"),
      port: z.coerce.number().default(6379),
      username: z.string().trim().min(1, "Username required"),
      password: z.string().trim().optional(),
      sslEnabled: z.boolean().default(false),
      sslRejectUnauthorized: z.boolean().default(true),
      sslCertificate: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .optional()
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

const CONFIGURATION_TAB = "configuration";
const SSL_TAB = "ssl";

export const RedisConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.Redis,
      method: RedisConnectionMethod.UsernameAndPassword,
      credentials: {
        host: "",
        port: 6379,
        username: "",
        password: "",
        sslEnabled: false,
        sslRejectUnauthorized: true,
        sslCertificate: undefined
      }
    }
  });

  const { handleSubmit, watch, control } = form;
  const scopeVariant = useScopeVariant();

  const sslEnabled = watch("credentials.sslEnabled");

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
                    The method you would like to use to connect with{" "}
                    {APP_CONNECTION_MAP[AppConnection.Redis].name}. This field cannot be changed
                    after creation.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error?.message)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(RedisConnectionMethod).map((method) => (
                    <SelectItem value={method} key={method}>
                      {getAppConnectionMethodDetails(method).name}{" "}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />

        <Tabs
          value={selectedTabIndex === 0 ? CONFIGURATION_TAB : SSL_TAB}
          onValueChange={(val) => setSelectedTabIndex(val === CONFIGURATION_TAB ? 0 : 1)}
          className="mb-4"
        >
          <TabsList variant={scopeVariant}>
            <TabsTrigger value={CONFIGURATION_TAB}>Configuration</TabsTrigger>
            <TabsTrigger value={SSL_TAB}>SSL ({sslEnabled ? "Enabled" : "Disabled"})</TabsTrigger>
          </TabsList>
          <TabsContent value={CONFIGURATION_TAB}>
            <div className="flex items-start gap-2">
              <Controller
                name="credentials.host"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <Field className="flex-1">
                    <FieldLabel htmlFor="redis-host">Host</FieldLabel>
                    <Input id="redis-host" {...field} isError={Boolean(error?.message)} />
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
              <Controller
                name="credentials.port"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <Field className="w-28">
                    <FieldLabel htmlFor="redis-port">Port</FieldLabel>
                    <Input
                      id="redis-port"
                      type="number"
                      {...field}
                      isError={Boolean(error?.message)}
                    />
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
            </div>
            <div className="mt-4 flex items-start gap-2">
              <Controller
                name="credentials.username"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <Field className="flex-1">
                    <FieldLabel htmlFor="redis-username">Username</FieldLabel>
                    <Input id="redis-username" {...field} isError={Boolean(error?.message)} />
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
              <Controller
                name="credentials.password"
                control={control}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <Field className="flex-1">
                    <FieldLabel>Password</FieldLabel>
                    <SecretInput value={value} onChange={(e) => onChange(e.target.value)} />
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
            </div>
          </TabsContent>
          <TabsContent value={SSL_TAB}>
            <Controller
              name="credentials.sslEnabled"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <Field orientation="horizontal">
                    <FieldContent>
                      <Label htmlFor="ssl-enabled">Enable SSL</Label>
                    </FieldContent>
                    <Switch
                      id="ssl-enabled"
                      variant={scopeVariant}
                      checked={value}
                      onCheckedChange={onChange}
                    />
                  </Field>
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
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
                    className="h-14 resize-none"
                    {...field}
                    disabled={!sslEnabled}
                    isError={Boolean(error?.message)}
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
                        If enabled, Infisical will only connect to the server if it has a valid,
                        trusted SSL certificate.
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
          submitLabel={isUpdate ? "Update Credentials" : "Connect to Database"}
        />
      </form>
    </FormProvider>
  );
};
