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
import { MongoDBConnectionMethod, TMongoDBConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TMongoDBConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.MongoDB)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(MongoDBConnectionMethod.UsernameAndPassword),
    credentials: z.object({
      host: z.string().trim().min(1, "Host required"),
      port: z.coerce.number().default(27017),
      username: z.string().trim().min(1, "Username required"),
      password: z.string().trim().min(1, "Password required"),
      database: z.string().trim().min(1, "Database required"),
      tlsEnabled: z.boolean().default(false),
      tlsRejectUnauthorized: z.boolean().default(true),
      tlsCertificate: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .optional()
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

const CONFIGURATION_TAB = "configuration";
const TLS_TAB = "tls";

export const MongoDBConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [selectedTabIndex, setSelectedTabIndex] = useState(0);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.MongoDB,
      method: MongoDBConnectionMethod.UsernameAndPassword,
      credentials: {
        host: "",
        port: 27017,
        username: "",
        password: "",
        database: "",
        tlsEnabled: false,
        tlsRejectUnauthorized: true,
        tlsCertificate: undefined
      }
    }
  });

  const { handleSubmit, watch, control } = form;
  const scopeVariant = useScopeVariant();

  const tlsEnabled = watch("credentials.tlsEnabled");

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
                    {APP_CONNECTION_MAP[AppConnection.MongoDB].name}. This field cannot be changed
                    after creation.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error?.message)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(MongoDBConnectionMethod).map((method) => (
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
          value={selectedTabIndex === 0 ? CONFIGURATION_TAB : TLS_TAB}
          onValueChange={(val) => setSelectedTabIndex(val === CONFIGURATION_TAB ? 0 : 1)}
          className="mb-4"
        >
          <TabsList variant={scopeVariant}>
            <TabsTrigger value={CONFIGURATION_TAB}>Configuration</TabsTrigger>
            <TabsTrigger value={TLS_TAB}>TLS ({tlsEnabled ? "Enabled" : "Disabled"})</TabsTrigger>
          </TabsList>
          <TabsContent value={CONFIGURATION_TAB}>
            <div className="flex items-start gap-2">
              <Controller
                name="credentials.host"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <Field className="flex-1">
                    <FieldLabel htmlFor="mongo-host">Host</FieldLabel>
                    <Input id="mongo-host" {...field} isError={Boolean(error?.message)} />
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
              <Controller
                name="credentials.database"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <Field className="flex-1">
                    <FieldLabel htmlFor="mongo-database">Database</FieldLabel>
                    <Input id="mongo-database" {...field} isError={Boolean(error?.message)} />
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
              <Controller
                name="credentials.port"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <Field className="w-28">
                    <FieldLabel htmlFor="mongo-port">Port</FieldLabel>
                    <Input
                      id="mongo-port"
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
                    <FieldLabel htmlFor="mongo-username">Username</FieldLabel>
                    <Input id="mongo-username" {...field} isError={Boolean(error?.message)} />
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
          <TabsContent value={TLS_TAB}>
            <Controller
              name="credentials.tlsEnabled"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <Field orientation="horizontal">
                    <FieldContent>
                      <Label htmlFor="tls-enabled">Enable TLS</Label>
                    </FieldContent>
                    <Switch
                      id="tls-enabled"
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
              name="credentials.tlsCertificate"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className={tlsEnabled ? "mb-4" : "mb-4 opacity-50"}>
                  <FieldLabel htmlFor="tls-certificate">
                    TLS Certificate <span className="text-muted">(optional)</span>
                  </FieldLabel>
                  <TextArea
                    id="tls-certificate"
                    className="h-14 resize-none"
                    {...field}
                    disabled={!tlsEnabled}
                    isError={Boolean(error?.message)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.tlsRejectUnauthorized"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className={tlsEnabled ? undefined : "opacity-50"}>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <Label htmlFor="tls-reject-unauthorized">Reject Unauthorized</Label>
                      <FieldDescription>
                        If enabled, Infisical will only connect to the server if it has a valid,
                        trusted TLS certificate.
                      </FieldDescription>
                    </FieldContent>
                    <Switch
                      id="tls-reject-unauthorized"
                      variant={scopeVariant}
                      checked={tlsEnabled ? value : false}
                      onCheckedChange={onChange}
                      disabled={!tlsEnabled}
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
