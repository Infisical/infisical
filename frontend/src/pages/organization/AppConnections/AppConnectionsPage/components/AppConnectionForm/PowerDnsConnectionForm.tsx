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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextArea,
  Toggle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import { OrgPermissionSubjects } from "@app/context";
import { OrgGatewayPermissionActions } from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { useScopeVariant } from "@app/hooks";
import { TPowerDnsConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { PowerDnsConnectionMethod } from "@app/hooks/api/appConnections/types/powerdns-connection";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TPowerDnsConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.PowerDns)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(PowerDnsConnectionMethod.ApiKey),
    credentials: z.object({
      apiUrl: z
        .string()
        .trim()
        .url("API URL must be a valid URL")
        .max(512, "API URL cannot exceed 512 characters")
        .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
          message: "API URL must use http or https"
        })
        .refine((value) => !new URL(value).search && !new URL(value).hash, {
          message: "API URL must not contain a query string or fragment"
        })
        .refine((value) => !/\/api(\/v\d+)?\/*$/.test(new URL(value).pathname), {
          message: "Enter the web server address only, without the /api/v1 path"
        }),
      apiKey: z
        .string()
        .trim()
        .min(1, "API key required")
        .max(512, "API key cannot exceed 512 characters"),
      serverId: z
        .string()
        .trim()
        .max(64, "Server ID cannot exceed 64 characters")
        .refine((value) => !value || /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value), {
          message: "Server ID may only contain letters, numbers, dots, hyphens and underscores"
        })
        .refine((value) => !value.includes(".."), { message: "Server ID cannot contain '..'" })
        .transform((value) => value || undefined)
        .optional(),
      sslRejectUnauthorized: z.boolean(),
      sslCertificate: z
        .string()
        .trim()
        .max(8192, "SSL certificate cannot exceed 8192 characters")
        .transform((value) => value || undefined)
        .optional()
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

const normalizeApiUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  try {
    const url = new URL(trimmed);
    url.pathname = url.pathname.replace(/\/api(\/v\d+)?\/*$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return trimmed;
  }
};

export const PowerDnsConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [selectedTab, setSelectedTab] = useState("configuration");

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.PowerDns,
      method: PowerDnsConnectionMethod.ApiKey,
      gatewayId: null,
      gatewayPoolId: null,
      credentials: {
        sslRejectUnauthorized: true,
        sslCertificate: undefined
      }
    }
  });

  const { handleSubmit, control, setValue, watch } = form;
  const scopeVariant = useScopeVariant();

  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}
        <OrgPermissionCan
          I={OrgGatewayPermissionActions.AttachGateways}
          a={OrgPermissionSubjects.Gateway}
        >
          {(isAllowed) => {
            const picker = (
              <GatewayPicker
                isDisabled={!isAllowed}
                value={{ gatewayId: gatewayId ?? null, gatewayPoolId: gatewayPoolId ?? null }}
                onChange={({ gatewayId: newGwId, gatewayPoolId: newPoolId }) => {
                  setValue("gatewayId", newGwId, { shouldDirty: true });
                  setValue("gatewayPoolId", newPoolId, { shouldDirty: true });
                }}
              />
            );

            return (
              <Field className="mb-4">
                <FieldLabel>Gateway</FieldLabel>
                <FieldDescription>
                  Route requests through a Gateway when your PowerDNS server is not reachable from
                  the internet.
                </FieldDescription>
                {isAllowed ? (
                  picker
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="block w-full cursor-not-allowed">{picker}</span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Restricted access. You don&apos;t have permission to attach gateways to
                      resources.
                    </TooltipContent>
                  </Tooltip>
                )}
              </Field>
            );
          }}
        </OrgPermissionCan>
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
                    {`The method you would like to use to connect with ${
                      APP_CONNECTION_MAP[AppConnection.PowerDns].name
                    }. This field cannot be changed after creation.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger id="method" className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(PowerDnsConnectionMethod).map((m) => {
                    return (
                      <SelectItem value={m} key={m}>
                        {getAppConnectionMethodDetails(m).name}
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
            <TabsTrigger value="ssl">SSL</TabsTrigger>
          </TabsList>
          <TabsContent value="configuration">
            <Controller
              name="credentials.apiUrl"
              control={control}
              render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="api-url">API URL</FieldLabel>
                  <FieldDescription>
                    The address of the PowerDNS web server, without the /api/v1 path.
                  </FieldDescription>
                  <Input
                    id="api-url"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onBlur={(e) => {
                      onChange(normalizeApiUrl(e.target.value));
                      onBlur();
                    }}
                    placeholder="https://pdns.example.com:8081"
                    isError={Boolean(error?.message)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.apiKey"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="api-key">API Key</FieldLabel>
                  <FieldDescription>
                    The value of the api-key setting in your PowerDNS configuration.
                  </FieldDescription>
                  <SecretInput
                    aria-describedby={error ? "api-key-error" : undefined}
                    isError={Boolean(error)}
                    id="api-key"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                  />
                  <FieldError id="api-key-error" errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.serverId"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="server-id">
                    Server ID <span className="text-muted">(optional)</span>
                  </FieldLabel>
                  <FieldDescription>
                    Leave empty unless you connect through a proxy fronting several PowerDNS
                    servers. A PowerDNS Authoritative Server always reports localhost.
                  </FieldDescription>
                  <Input
                    id="server-id"
                    {...field}
                    value={field.value ?? ""}
                    placeholder="localhost"
                    isError={Boolean(error?.message)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </TabsContent>
          <TabsContent value="ssl">
            <Controller
              name="credentials.sslCertificate"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="ssl-certificate">
                    SSL Certificate <span className="text-muted">(optional)</span>
                  </FieldLabel>
                  <TextArea
                    id="ssl-certificate"
                    className="h-[3.6rem] resize-none!"
                    {...field}
                    placeholder="-----BEGIN CERTIFICATE----- ... -----END CERTIFICATE-----"
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
                <Field>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <Label htmlFor="ssl-reject-unauthorized">Reject Unauthorized</Label>
                      <FieldDescription>
                        If enabled, Infisical will only connect if PowerDNS presents a valid,
                        trusted SSL certificate. Disable this for self-signed certificates or
                        provide a CA certificate above.
                      </FieldDescription>
                    </FieldContent>
                    <Toggle
                      aria-invalid={Boolean(error)}
                      id="ssl-reject-unauthorized"
                      variant={scopeVariant}
                      checked={value}
                      onCheckedChange={onChange}
                    />
                  </Field>
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </TabsContent>
        </Tabs>
        <AppConnectionFormFooter
          submitLabel={isUpdate ? "Update Credentials" : "Connect to PowerDNS"}
        />
      </form>
    </FormProvider>
  );
};
