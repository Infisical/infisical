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
import { isValidEmail } from "@app/helpers/email";
import { useScopeVariant } from "@app/hooks";
import { JiraConnectionMethod, TJiraConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TJiraConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const DEPLOYMENT_BY_METHOD: Record<
  JiraConnectionMethod,
  { name: string; instanceUrlPlaceholder: string }
> = {
  [JiraConnectionMethod.ApiToken]: {
    name: "Jira Cloud",
    instanceUrlPlaceholder: "https://your-domain.atlassian.net"
  },
  [JiraConnectionMethod.PersonalAccessToken]: {
    name: "Jira Data Center",
    instanceUrlPlaceholder: "https://jira.example.com"
  }
};

const isValidInstanceUrl = (value: string) => {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
};

const instanceUrlSchema = z
  .string()
  .trim()
  .min(1, "Instance URL required")
  .max(512, "Instance URL cannot exceed 512 characters")
  .refine(
    isValidInstanceUrl,
    "Instance URL must be an http or https URL without credentials, a query, or a fragment"
  );

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Jira)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(JiraConnectionMethod.ApiToken),
    credentials: z.object({
      instanceUrl: instanceUrlSchema,
      email: z
        .string()
        .trim()
        .min(1, "Email required")
        .max(320, "Email cannot exceed 320 characters")
        .refine(isValidEmail, "Email must be a valid email address"),
      apiToken: z
        .string()
        .trim()
        .min(1, "API token required")
        .max(1024, "API token cannot exceed 1024 characters")
    })
  }),
  rootSchema.extend({
    method: z.literal(JiraConnectionMethod.PersonalAccessToken),
    credentials: z.object({
      instanceUrl: instanceUrlSchema,
      personalAccessToken: z
        .string()
        .trim()
        .min(1, "Personal access token required")
        .max(1024, "Personal access token cannot exceed 1024 characters"),
      sslRejectUnauthorized: z.boolean().default(true),
      sslCertificate: z
        .string()
        .trim()
        .max(16384, "SSL certificate cannot exceed 16384 characters")
        .transform((value) => value || undefined)
        .optional()
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const JiraConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [selectedTab, setSelectedTab] = useState("configuration");

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.Jira,
      method: JiraConnectionMethod.ApiToken,
      gatewayId: null,
      gatewayPoolId: null
    }
  });

  const { handleSubmit, control, setValue, watch } = form;
  const scopeVariant = useScopeVariant();

  const method = watch("method");
  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");

  const instanceUrlField = (
    <Controller
      name="credentials.instanceUrl"
      control={control}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <Field className="mb-4">
          <FieldLabel htmlFor="instance-url">Instance URL</FieldLabel>
          {method === JiraConnectionMethod.PersonalAccessToken && (
            <FieldDescription>
              Include the context path if Jira runs under one, such as /jira.
            </FieldDescription>
          )}
          <Input
            id="instance-url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={DEPLOYMENT_BY_METHOD[method].instanceUrlPlaceholder}
            isError={Boolean(error?.message)}
          />
          <FieldError errors={[error]} />
        </Field>
      )}
    />
  );

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
                  Route requests through a Gateway when your Jira instance is not reachable from the
                  internet.
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
                      APP_CONNECTION_MAP[AppConnection.Jira].name
                    }. This field cannot be changed after creation.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger id="method" className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(JiraConnectionMethod).map((m) => (
                    <SelectItem value={m} key={m}>
                      {getAppConnectionMethodDetails(m).name} ({DEPLOYMENT_BY_METHOD[m].name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        {method === JiraConnectionMethod.ApiToken ? (
          <>
            {instanceUrlField}
            <Controller
              name="credentials.email"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="user@example.com"
                    isError={Boolean(error?.message)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.apiToken"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="api-token">API Token</FieldLabel>
                  <FieldDescription>
                    Create one in your Atlassian account settings under Security &gt; API tokens.
                  </FieldDescription>
                  <SecretInput
                    aria-describedby={error ? "api-token-error" : undefined}
                    isError={Boolean(error)}
                    id="api-token"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                  />
                  <FieldError id="api-token-error" errors={[error]} />
                </Field>
              )}
            />
          </>
        ) : (
          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="mb-4">
            <TabsList variant={scopeVariant}>
              <TabsTrigger value="configuration">Configuration</TabsTrigger>
              <TabsTrigger value="ssl">SSL</TabsTrigger>
            </TabsList>
            <TabsContent value="configuration">
              {instanceUrlField}
              <Controller
                name="credentials.personalAccessToken"
                control={control}
                render={({ field: { value, onChange }, fieldState: { error } }) => (
                  <Field className="mb-4">
                    <FieldLabel htmlFor="personal-access-token">Personal Access Token</FieldLabel>
                    <FieldDescription>
                      Create one in Jira under Profile &gt; Personal Access Tokens.
                    </FieldDescription>
                    <SecretInput
                      aria-describedby={error ? "personal-access-token-error" : undefined}
                      isError={Boolean(error)}
                      id="personal-access-token"
                      value={value}
                      onChange={(e) => onChange(e.target.value)}
                    />
                    <FieldError id="personal-access-token-error" errors={[error]} />
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
                          If enabled, Infisical will only connect if Jira presents a valid, trusted
                          SSL certificate. Disable this for self-signed certificates or provide a CA
                          certificate above.
                        </FieldDescription>
                      </FieldContent>
                      <Toggle
                        aria-invalid={Boolean(error)}
                        id="ssl-reject-unauthorized"
                        variant={scopeVariant}
                        checked={value ?? true}
                        onCheckedChange={onChange}
                      />
                    </Field>
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
            </TabsContent>
          </Tabs>
        )}
        <AppConnectionFormFooter
          submitLabel={isUpdate ? "Update Credentials" : "Connect to Jira"}
        />
      </form>
    </FormProvider>
  );
};
