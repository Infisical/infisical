import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import { OrgPermissionCan } from "@app/components/permissions";
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
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import { OrgPermissionSubjects, useSubscription } from "@app/context";
import { OrgGatewayPermissionActions } from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { DistinguishedNameRegex, UserPrincipalNameRegex } from "@app/helpers/string";
import { useScopeVariant } from "@app/hooks";
import {
  LdapConnectionMethod,
  LdapConnectionProvider,
  TLdapConnection
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TLdapConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.LDAP)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(LdapConnectionMethod.SimpleBind),
    credentials: z.object({
      provider: z.nativeEnum(LdapConnectionProvider),
      url: z
        .string()
        .regex(/^ldaps?:\/\//, 'Must start with "ldaps://" or "ldap://"')
        .url()
        .trim()
        .min(1, "LDAP URL required"),
      dn: z
        .string()
        .trim()
        .min(1, "DN/UPN required")
        .refine(
          (value) => DistinguishedNameRegex.test(value) || UserPrincipalNameRegex.test(value),
          {
            message: "Invalid DN/UPN format"
          }
        ),
      password: z.string().trim().min(1, "Password required"),
      sslRejectUnauthorized: z.boolean(),
      sslCertificate: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .optional()
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const LdapConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [selectedTab, setSelectedTab] = useState("configuration");

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.LDAP,
      method: LdapConnectionMethod.SimpleBind,
      gatewayId: null,
      gatewayPoolId: null,
      credentials: {
        provider: LdapConnectionProvider.ActiveDirectory,
        url: "",
        dn: "",
        password: "",
        sslRejectUnauthorized: true,
        sslCertificate: undefined
      }
    }
  });

  const { handleSubmit, control, setValue, watch } = form;
  const scopeVariant = useScopeVariant();

  const selectedProvider = watch("credentials.provider");
  const sslEnabled = watch("credentials.url")?.startsWith("ldaps://") ?? false;
  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");
  const { subscription } = useSubscription();

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(e) => {
          setSelectedTab("configuration");
          handleSubmit(onSubmit)(e);
        }}
      >
        {!isUpdate && <GenericAppConnectionsFields />}
        {subscription.gateway && (
          <OrgPermissionCan
            I={OrgGatewayPermissionActions.AttachGateways}
            a={OrgPermissionSubjects.Gateway}
          >
            {(isAllowed) => (
              <Field className="mb-4">
                <FieldLabel>Gateway</FieldLabel>
                {isAllowed ? (
                  <GatewayPicker
                    isDisabled={!isAllowed}
                    value={{ gatewayId: gatewayId ?? null, gatewayPoolId: gatewayPoolId ?? null }}
                    onChange={({ gatewayId: newGwId, gatewayPoolId: newPoolId }) => {
                      setValue("gatewayId", newGwId, { shouldDirty: true });
                      setValue("gatewayPoolId", newPoolId, { shouldDirty: true });
                    }}
                  />
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <GatewayPicker
                          isDisabled={!isAllowed}
                          value={{
                            gatewayId: gatewayId ?? null,
                            gatewayPoolId: gatewayPoolId ?? null
                          }}
                          onChange={({ gatewayId: newGwId, gatewayPoolId: newPoolId }) => {
                            setValue("gatewayId", newGwId, { shouldDirty: true });
                            setValue("gatewayPoolId", newPoolId, { shouldDirty: true });
                          }}
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      Restricted access. You don&apos;t have permission to attach gateways to
                      resources.
                    </TooltipContent>
                  </Tooltip>
                )}
              </Field>
            )}
          </OrgPermissionCan>
        )}
        <div className="grid grid-cols-2 items-center gap-2">
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
                        APP_CONNECTION_MAP[AppConnection.LDAP].name
                      }. This field cannot be changed after creation.`}
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                  <SelectTrigger className="w-full" isError={Boolean(error)}>
                    <SelectValue placeholder="Select a method..." />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {Object.values(LdapConnectionMethod).map((method) => {
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
            name="credentials.provider"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel>LDAP Provider</FieldLabel>
                <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                  <SelectTrigger className="w-full capitalize" isError={Boolean(error)}>
                    <SelectValue placeholder="Select a provider..." />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {Object.values(LdapConnectionProvider).map((provider) => {
                      return (
                        <SelectItem value={provider} className="capitalize" key={provider}>
                          {provider.replace("-", " ")}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        </div>
        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="mb-4">
          <TabsList variant={scopeVariant}>
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
            <TabsTrigger value="ssl">SSL ({sslEnabled ? "Enabled" : "Disabled"})</TabsTrigger>
          </TabsList>
          <TabsContent value="configuration">
            <Controller
              name="credentials.url"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials-url">LDAP URL</FieldLabel>
                  <Input
                    id="credentials-url"
                    {...field}
                    placeholder="ldap://domain-or-ip:389"
                    isError={Boolean(error?.message)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <div className="grid grid-cols-2 gap-2">
              <Controller
                name="credentials.dn"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <Field className="mb-4">
                    <FieldLabel htmlFor="credentials-dn">Binding DN/UPN</FieldLabel>
                    <Input
                      id="credentials-dn"
                      {...field}
                      placeholder="CN=John,OU=Users,DC=example,DC=com"
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
                    <FieldLabel>Binding Password</FieldLabel>
                    <SecretInput value={value} onChange={(e) => onChange(e.target.value)} />
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
            </div>
          </TabsContent>
          <TabsContent value="ssl">
            <p className="mb-3 text-xs text-muted">Requires ldaps:// URL</p>
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
          submitLabel={
            isUpdate
              ? "Update Credentials"
              : `Connect to ${selectedProvider
                  .replace("-", " ")
                  .replace(/\b\w/g, (char) => char.toUpperCase())}`
          }
        />
      </form>
    </FormProvider>
  );
};
