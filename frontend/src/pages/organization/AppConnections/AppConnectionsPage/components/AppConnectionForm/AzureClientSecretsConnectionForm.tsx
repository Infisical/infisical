/* eslint-disable no-case-declarations */
import crypto from "crypto";

import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import {
  Button,
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
  SheetFooter,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  APP_CONNECTION_MAP,
  getAppConnectionMethodDetails,
  useGetAppConnectionOauthReturnUrl
} from "@app/helpers/appConnections";
import { isInfisicalCloud } from "@app/helpers/platform";
import { useScopeVariant } from "@app/hooks";
import {
  AzureClientSecretsConnectionMethod,
  TAzureClientSecretsConnection,
  useGetAppConnectionOption
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AzureClientSecretsFormData } from "../../../OauthCallbackPage/OauthCallbackPage.types";
import { CredentialRotationForm } from "./shared/CredentialRotationForm";
import { useAppConnectionForm } from "./AppConnectionFormContext";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type ClientSecretForm = z.infer<typeof clientSecretSchema>;
type CertificateForm = z.infer<typeof certificateSchema>;

type TInputFormData = ClientSecretForm | CertificateForm;

type Props = {
  appConnection?: TAzureClientSecretsConnection;
  onSubmit: (formData: TInputFormData) => Promise<void>;
  projectId: string | undefined | null;
};

const baseSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.AzureClientSecrets),
  method: z.nativeEnum(AzureClientSecretsConnectionMethod)
});

const oauthSchema = baseSchema.extend({
  tenantId: z.string().trim().min(1, "Tenant ID is required"),
  method: z.literal(AzureClientSecretsConnectionMethod.OAuth)
});

const clientSecretSchema = baseSchema.extend({
  method: z.literal(AzureClientSecretsConnectionMethod.ClientSecret),
  credentials: z.object({
    clientSecret: z.string().trim().min(1, "Client Secret is required"),
    clientId: z.string().trim().min(1, "Client ID is required"),
    tenantId: z.string().trim().min(1, "Tenant ID is required"),
    clientSecretKeyId: z.string().trim().optional()
  })
});

const certificateSchema = baseSchema.extend({
  method: z.literal(AzureClientSecretsConnectionMethod.Certificate),
  credentials: z.object({
    clientId: z.string().trim().min(1, "Client ID is required"),
    certificateBody: z.string().trim().min(1, "Certificate is required"),
    privateKey: z.string().trim().min(1, "Private Key is required"),
    tenantId: z.string().trim().min(1, "Tenant ID is required")
  })
});

const formSchema = z.discriminatedUnion("method", [
  oauthSchema,
  clientSecretSchema,
  certificateSchema
]);

type FormData = z.infer<typeof formSchema>;

const defaultRotation = {
  rotationInterval: 30,
  rotateAtUtc: {
    hours: 0,
    minutes: 0
  }
};

const getDefaultValues = (appConnection?: TAzureClientSecretsConnection): Partial<FormData> => {
  if (!appConnection) {
    return {
      app: AppConnection.AzureClientSecrets,
      method: AzureClientSecretsConnectionMethod.OAuth,
      isAutoRotationEnabled: false,
      rotation: defaultRotation
    };
  }

  const base = {
    name: appConnection.name,
    description: appConnection.description,
    app: appConnection.app,
    method: appConnection.method,
    isAutoRotationEnabled: appConnection.isAutoRotationEnabled,
    rotation: appConnection.rotation ?? defaultRotation
  };
  const { credentials } = appConnection;

  switch (appConnection.method) {
    case AzureClientSecretsConnectionMethod.OAuth:
      if ("tenantId" in credentials) {
        return {
          ...base,
          method: AzureClientSecretsConnectionMethod.OAuth,
          tenantId: credentials.tenantId
        };
      }
      break;
    case AzureClientSecretsConnectionMethod.ClientSecret:
      if ("clientId" in credentials) {
        return {
          ...base,
          method: AzureClientSecretsConnectionMethod.ClientSecret,
          credentials: {
            clientId: credentials.clientId,
            tenantId: credentials.tenantId,
            clientSecret: ""
          }
        };
      }
      break;
    case AzureClientSecretsConnectionMethod.Certificate:
      if ("clientId" in credentials && "tenantId" in credentials) {
        return {
          ...base,
          method: AzureClientSecretsConnectionMethod.Certificate,
          credentials: {
            clientId: credentials.clientId,
            tenantId: credentials.tenantId,
            certificateBody: "",
            privateKey: ""
          }
        };
      }
      break;
    default:
      return base;
  }

  return base;
};

export const AzureClientSecretsConnectionForm = ({ appConnection, onSubmit, projectId }: Props) => {
  const isUpdate = Boolean(appConnection);
  const { onCancel } = useAppConnectionForm();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const {
    option: { oauthClientId },
    isLoading
  } = useGetAppConnectionOption(AppConnection.AzureClientSecrets);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: getDefaultValues(appConnection)
  });

  const returnUrl = useGetAppConnectionOauthReturnUrl();

  const {
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { isSubmitting, isDirty }
  } = form;

  const scopeVariant = useScopeVariant();

  const selectedMethod = watch("method");

  const onSubmitHandler = async (formData: FormData) => {
    const state = crypto.randomBytes(16).toString("hex");
    switch (formData.method) {
      case AzureClientSecretsConnectionMethod.OAuth:
        setIsRedirecting(true);
        localStorage.setItem("latestCSRFToken", state);
        localStorage.setItem(
          "azureClientSecretsConnectionFormData",
          JSON.stringify({
            ...formData,
            connectionId: appConnection?.id,
            projectId,
            returnUrl
          } as AzureClientSecretsFormData)
        );
        window.location.assign(
          `https://login.microsoftonline.com/${formData.tenantId || "common"}/oauth2/v2.0/authorize?client_id=${oauthClientId}&response_type=code&redirect_uri=${window.location.origin}/organization/app-connections/azure/oauth/callback&response_mode=query&scope=https://graph.microsoft.com/.default%20openid%20offline_access&state=${state}<:>azure-client-secrets`
        );
        break;

      case AzureClientSecretsConnectionMethod.ClientSecret:
        await onSubmit(formData);
        break;
      case AzureClientSecretsConnectionMethod.Certificate:
        await onSubmit(formData);
        break;
      default:
        throw new Error(`Unhandled Azure Connection method: ${(formData as FormData).method}`);
    }
  };

  const isMissingConfig =
    selectedMethod === AzureClientSecretsConnectionMethod.OAuth && !oauthClientId;
  const methodDetails = getAppConnectionMethodDetails(selectedMethod);

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmitHandler)}>
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
                    {APP_CONNECTION_MAP[AppConnection.AzureClientSecrets].name}. This field cannot
                    be changed after creation.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger
                  id="method"
                  className="w-full"
                  isError={Boolean(error) || isMissingConfig}
                >
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(AzureClientSecretsConnectionMethod).map((method) => {
                    return (
                      <SelectItem value={method} key={method}>
                        {getAppConnectionMethodDetails(method).name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <FieldError>
                {!isLoading && isMissingConfig
                  ? `Environment variables have not been configured. ${
                      isInfisicalCloud()
                        ? "Please contact Infisical."
                        : `See documentation to configure Azure ${methodDetails.name} Connections.`
                    }`
                  : error?.message}
              </FieldError>
            </Field>
          )}
        />

        <Controller
          name={
            selectedMethod === AzureClientSecretsConnectionMethod.OAuth
              ? "tenantId"
              : "credentials.tenantId"
          }
          control={control}
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="tenantId">
                Tenant ID
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">The Directory (tenant) ID.</TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                {...field}
                id="tenantId"
                placeholder="00000000-0000-0000-0000-000000000000"
                isError={Boolean(error)}
                onChange={(e) => {
                  field.onChange(e.target.value);
                  setValue("credentials.tenantId", e.target.value);
                }}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />

        {/* Access Token-specific fields */}
        {selectedMethod === AzureClientSecretsConnectionMethod.ClientSecret && (
          <>
            <Controller
              name="credentials.clientId"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials.clientId">Client ID</FieldLabel>
                  <Input
                    {...field}
                    id="credentials.clientId"
                    placeholder="00000000-0000-0000-0000-000000000000"
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.clientSecret"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials.clientSecret">Client Secret</FieldLabel>
                  <Input
                    {...field}
                    id="credentials.clientSecret"
                    type="password"
                    placeholder="~JzD8e6S.tH~w8XRaNnKcb7W1fM4rCns7FY"
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />

            <CredentialRotationForm>
              <Controller
                name="credentials.clientSecretKeyId"
                control={control}
                render={({ field, fieldState: { error } }) => (
                  <Field className="mb-4">
                    <FieldLabel htmlFor="credentials.clientSecretKeyId">
                      Client Secret Key ID
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-sm">
                          The Key ID of the client secret provided above. Found in Azure Portal
                          under App Registrations &gt; Certificates &amp; Secrets. Required so
                          Infisical can revoke the original secret after rotation.
                        </TooltipContent>
                      </Tooltip>
                    </FieldLabel>
                    <Input
                      {...field}
                      id="credentials.clientSecretKeyId"
                      placeholder="00000000-0000-0000-0000-000000000000"
                      isError={Boolean(error)}
                    />
                    <FieldError errors={[error]} />
                  </Field>
                )}
              />
            </CredentialRotationForm>
          </>
        )}

        {selectedMethod === AzureClientSecretsConnectionMethod.Certificate && (
          <>
            <Controller
              name="credentials.clientId"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials.clientId">Client ID</FieldLabel>
                  <Input
                    {...field}
                    id="credentials.clientId"
                    placeholder="00000000-0000-0000-0000-000000000000"
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.certificateBody"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials.certificateBody">Certificate</FieldLabel>
                  <SecretInput
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="-----BEGIN CERTIFICATE-----..."
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.privateKey"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials.privateKey">Private Key</FieldLabel>
                  <SecretInput
                    placeholder="-----BEGIN PRIVATE KEY-----..."
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </>
        )}
        <SheetFooter className="sticky bottom-0 -mx-4 items-center border-t bg-popover">
          <Button
            type="submit"
            variant={scopeVariant}
            isPending={isSubmitting || isRedirecting}
            isDisabled={isSubmitting || (!isUpdate && !isDirty) || isMissingConfig || isRedirecting}
          >
            {isUpdate ? "Reconnect to Azure" : "Connect to Azure"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            isDisabled={isSubmitting || isRedirecting}
          >
            Cancel
          </Button>
        </SheetFooter>
      </form>
    </FormProvider>
  );
};
