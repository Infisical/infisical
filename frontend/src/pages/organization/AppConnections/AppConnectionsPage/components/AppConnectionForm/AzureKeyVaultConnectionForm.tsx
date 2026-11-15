import crypto from "crypto";
import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info, KeyRoundIcon } from "lucide-react";
import { z } from "zod";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  CopyButton,
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
  SheetFooter,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import { useSubscription } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import {
  APP_CONNECTION_MAP,
  getAppConnectionMethodDetails,
  useGetAppConnectionOauthReturnUrl
} from "@app/helpers/appConnections";
import { isInfisicalCloud } from "@app/helpers/platform";
import { useScopeVariant } from "@app/hooks";
import { useGetAppConnectionOption } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  AzureKeyVaultConnectionMethod,
  TAzureKeyVaultConnection
} from "@app/hooks/api/appConnections/types/azure-key-vault-connection";
import { ScopeVariant } from "@app/hooks/useScopeVariant";

import { AzureKeyVaultFormData } from "../../../OauthCallbackPage/OauthCallbackPage.types";
import { useAppConnectionForm, useAppConnectionFormDirtyState } from "./AppConnectionFormContext";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";
import { CredentialRotationForm } from "./shared/CredentialRotationForm";

type ClientSecretForm = z.infer<typeof clientSecretSchema>;
type CertificateForm = z.infer<typeof certificateSchema>;
type ManagedIdentityForm = z.infer<typeof managedIdentitySchema>;

type TInputFormData = ClientSecretForm | CertificateForm | ManagedIdentityForm;

type Props = {
  appConnection?: TAzureKeyVaultConnection;
  onSubmit: (formData: TInputFormData) => Promise<void>;
  projectId: string | undefined | null;
};

const baseSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.AzureKeyVault),
  method: z.nativeEnum(AzureKeyVaultConnectionMethod)
});

const oauthSchema = baseSchema.extend({
  tenantId: z.string().trim().min(1, "Tenant ID is required"),
  method: z.literal(AzureKeyVaultConnectionMethod.OAuth)
});

const clientSecretSchema = baseSchema.extend({
  method: z.literal(AzureKeyVaultConnectionMethod.ClientSecret),
  credentials: z.object({
    clientSecret: z.string().trim().min(1, "Client Secret is required"),
    clientId: z.string().trim().min(1, "Client ID is required"),
    tenantId: z.string().trim().min(1, "Tenant ID is required"),
    clientSecretKeyId: z.string().trim().optional()
  })
});

const certificateSchema = baseSchema.extend({
  method: z.literal(AzureKeyVaultConnectionMethod.Certificate),
  credentials: z.object({
    clientId: z.string().trim().min(1, "Client ID is required"),
    certificateBody: z.string().trim().min(1, "Certificate is required"),
    privateKey: z.string().trim().min(1, "Private Key is required"),
    tenantId: z.string().trim().min(1, "Tenant ID is required")
  })
});

const managedIdentitySchema = baseSchema.extend({
  method: z.literal(AzureKeyVaultConnectionMethod.ManagedIdentity),
  credentials: z.object({
    clientId: z.string().trim().min(1, "Client ID is required"),
    tenantId: z.string().trim().min(1, "Tenant ID is required")
  })
});

const formSchema = z.discriminatedUnion("method", [
  oauthSchema,
  clientSecretSchema,
  certificateSchema,
  managedIdentitySchema
]);

// Marks the value generated for this connection, in the scope's color like its buttons
const GENERATED_VALUE_BORDER: Record<ScopeVariant, string> = {
  org: "border-org/25",
  project: "border-project/25",
  "sub-org": "border-sub-org/25",
  av: "border-product-av/30",
  ss: "border-product-ss/30"
};

const CopyableValue = ({
  label,
  value,
  className
}: {
  label: string;
  value: string;
  className?: string;
}) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-xs text-accent">{label}</span>
    <div
      className={`flex items-start gap-2 rounded-md border bg-container py-2 pr-2 pl-3 ${className ?? "border-border"}`}
    >
      <code className="min-w-0 grow font-mono text-xs leading-5 break-all text-foreground">
        {value}
      </code>
      <CopyButton value={value} ariaLabel={`Copy ${label}`} />
    </div>
  </div>
);

type FormData = z.infer<typeof formSchema>;

const getDefaultValues = (appConnection?: TAzureKeyVaultConnection): Partial<FormData> => {
  const defaultRotation = {
    rotationInterval: 30,
    rotateAtUtc: {
      hours: 0,
      minutes: 0
    }
  };

  if (!appConnection) {
    return {
      app: AppConnection.AzureKeyVault,
      method: AzureKeyVaultConnectionMethod.OAuth,
      isAutoRotationEnabled: false,
      rotation: defaultRotation,
      gatewayId: null,
      gatewayPoolId: null
    };
  }

  const base = {
    name: appConnection.name,
    description: appConnection.description,
    app: appConnection.app,
    method: appConnection.method,
    isAutoRotationEnabled: appConnection.isAutoRotationEnabled,
    rotation: appConnection.rotation ?? defaultRotation,
    gatewayId: appConnection.gatewayId,
    gatewayPoolId: appConnection.gatewayPoolId
  };
  const { credentials } = appConnection;

  switch (appConnection.method) {
    case AzureKeyVaultConnectionMethod.OAuth:
      if ("tenantId" in credentials) {
        return {
          ...base,
          method: AzureKeyVaultConnectionMethod.OAuth,
          tenantId: credentials.tenantId
        };
      }
      break;
    case AzureKeyVaultConnectionMethod.ClientSecret:
      if ("clientId" in credentials && "tenantId" in credentials) {
        return {
          ...base,
          method: AzureKeyVaultConnectionMethod.ClientSecret,
          credentials: {
            clientId: credentials.clientId,
            tenantId: credentials.tenantId,
            clientSecret: ""
          }
        };
      }
      break;
    case AzureKeyVaultConnectionMethod.Certificate:
      if ("clientId" in credentials && "tenantId" in credentials) {
        return {
          ...base,
          method: AzureKeyVaultConnectionMethod.Certificate,
          credentials: {
            clientId: credentials.clientId,
            tenantId: credentials.tenantId,
            certificateBody: "",
            privateKey: ""
          }
        };
      }
      break;
    case AzureKeyVaultConnectionMethod.ManagedIdentity:
      if ("clientId" in credentials && "tenantId" in credentials) {
        return {
          ...base,
          method: AzureKeyVaultConnectionMethod.ManagedIdentity,
          credentials: {
            clientId: credentials.clientId,
            tenantId: credentials.tenantId
          }
        };
      }
      break;
    default:
      return base;
  }

  return base;
};

export const AzureKeyVaultConnectionForm = ({ appConnection, onSubmit, projectId }: Props) => {
  const isUpdate = Boolean(appConnection);
  const { onCancel, isNewConnection } = useAppConnectionForm();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [hasVerifyFailed, setHasVerifyFailed] = useState(false);

  const {
    option: { oauthClientId },
    isLoading
  } = useGetAppConnectionOption(AppConnection.AzureKeyVault);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: getDefaultValues(appConnection)
  });

  const returnUrl = useGetAppConnectionOauthReturnUrl();

  const {
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { isSubmitting, isDirty }
  } = form;

  useAppConnectionFormDirtyState(isDirty);

  const scopeVariant = useScopeVariant();

  const selectedMethod = watch("method");
  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");

  const { subscription } = useSubscription();

  const federatedCredential =
    appConnection?.method === AzureKeyVaultConnectionMethod.ManagedIdentity
      ? appConnection.credentials.federatedCredential
      : undefined;

  const onSubmitHandler = async (formData: FormData) => {
    const state = crypto.randomBytes(16).toString("hex");

    switch (formData.method) {
      case AzureKeyVaultConnectionMethod.OAuth:
        setIsRedirecting(true);
        localStorage.setItem("latestCSRFToken", state);
        localStorage.setItem(
          "azureKeyVaultConnectionFormData",
          JSON.stringify({
            ...formData,
            connectionId: appConnection?.id,
            projectId,
            returnUrl
          } as AzureKeyVaultFormData)
        );
        window.location.assign(
          `https://login.microsoftonline.com/${formData.tenantId || "common"}/oauth2/v2.0/authorize?client_id=${oauthClientId}&response_type=code&redirect_uri=${window.location.origin}/organization/app-connections/azure/oauth/callback&response_mode=query&scope=https://vault.azure.net/.default%20openid%20offline_access&state=${state}<:>azure-key-vault`
        );
        break;
      case AzureKeyVaultConnectionMethod.ClientSecret:
        await onSubmit(formData);
        break;
      case AzureKeyVaultConnectionMethod.Certificate:
        await onSubmit(formData);
        break;
      case AzureKeyVaultConnectionMethod.ManagedIdentity:
        if (!isUpdate) {
          await onSubmit(formData);
          break;
        }
        setHasVerifyFailed(false);
        try {
          await onSubmit(formData);
        } catch {
          // The request's error toast already explains the failure
          setHasVerifyFailed(true);
        }
        break;
      default:
        throw new Error(`Unhandled Azure Connection method: ${(formData as FormData).method}`);
    }
  };

  let isMissingConfig: boolean;

  switch (selectedMethod) {
    case AzureKeyVaultConnectionMethod.OAuth:
      isMissingConfig = !oauthClientId;
      break;
    case AzureKeyVaultConnectionMethod.ClientSecret:
      isMissingConfig = false;
      break;
    case AzureKeyVaultConnectionMethod.Certificate:
    case AzureKeyVaultConnectionMethod.ManagedIdentity:
      isMissingConfig = false;
      break;
    default:
      throw new Error(`Unhandled Azure Connection method: ${selectedMethod}`);
  }

  const methodDetails = getAppConnectionMethodDetails(selectedMethod);

  const isManagedIdentity = selectedMethod === AzureKeyVaultConnectionMethod.ManagedIdentity;
  // Azure needs the connection ID in the subject, so a new connection is created from the federated credential step
  const isConfiguringManagedIdentity = isManagedIdentity && !isUpdate;

  let submitLabel = isUpdate ? "Reconnect to Azure" : "Connect to Azure";
  if (isManagedIdentity) {
    submitLabel = hasVerifyFailed ? "Retry Verification" : "Verify Connection";
  }

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmitHandler)}>
        {!isUpdate && <GenericAppConnectionsFields />}
        {appConnection && isManagedIdentity && (
          <>
            <Field className="mb-4">
              <FieldLabel htmlFor="app-connection-name">Name</FieldLabel>
              <Input id="app-connection-name" value={appConnection.name} readOnly disabled />
            </Field>
            <Field className="mb-4">
              <FieldLabel htmlFor="app-connection-description">
                Description <span className="text-muted">(optional)</span>
              </FieldLabel>
              <TextArea
                id="app-connection-description"
                className="resize-none"
                rows={2}
                placeholder="Connection description..."
                value={appConnection.description ?? ""}
                readOnly
                disabled
              />
            </Field>
          </>
        )}

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
                    {APP_CONNECTION_MAP[AppConnection.AzureKeyVault].name}. This field cannot be
                    changed after creation.
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
                  {Object.values(AzureKeyVaultConnectionMethod).map((method) => {
                    return (
                      <SelectItem value={method} key={method}>
                        {getAppConnectionMethodDetails(method).name}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {isUpdate && isManagedIdentity && (
                <FieldDescription>
                  Name and method are fixed once the connection is created.
                </FieldDescription>
              )}
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

        {subscription.gateway && (
          <OrgPermissionCan
            I={OrgGatewayPermissionActions.AttachGateways}
            a={OrgPermissionSubjects.Gateway}
          >
            {(isAllowed) => (
              <Field className="mb-4">
                <FieldLabel>Gateway</FieldLabel>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <GatewayPicker
                        isDisabled={!isAllowed || isNewConnection}
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
                  {!isAllowed && (
                    <TooltipContent>
                      Restricted access. You don&apos;t have permission to attach gateways to
                      resources.
                    </TooltipContent>
                  )}
                </Tooltip>
              </Field>
            )}
          </OrgPermissionCan>
        )}

        {selectedMethod === AzureKeyVaultConnectionMethod.OAuth && (
          <Controller
            name="tenantId"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel htmlFor="tenantId">
                  Tenant ID
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      The Azure Active Directory (Entra ID) Tenant ID.
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <Input
                  {...field}
                  id="tenantId"
                  placeholder="00000000-0000-0000-0000-000000000000"
                  isError={Boolean(error)}
                />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        )}

        {/* Client Secret-specific fields */}
        {selectedMethod === AzureKeyVaultConnectionMethod.ClientSecret && (
          <>
            <Controller
              name="credentials.tenantId"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials.tenantId">
                    Tenant ID
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        The Azure Active Directory (Entra ID) Tenant ID.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input
                    {...field}
                    id="credentials.tenantId"
                    placeholder="00000000-0000-0000-0000-000000000000"
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
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

        {/* Certificate-specific fields */}
        {selectedMethod === AzureKeyVaultConnectionMethod.Certificate && (
          <>
            <Controller
              name="credentials.tenantId"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials.tenantId">
                    Tenant ID
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        The Azure Active Directory (Entra ID) Tenant ID.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input
                    {...field}
                    id="credentials.tenantId"
                    placeholder="00000000-0000-0000-0000-000000000000"
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
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
                  <FieldLabel htmlFor="credentials.certificateBody">
                    Certificate
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        The PEM-encoded public certificate uploaded to your Azure App Registration.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <SecretInput
                    aria-describedby={error ? "credentials.certificateBody-error" : undefined}
                    id="credentials.certificateBody"
                    isError={Boolean(error)}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="-----BEGIN CERTIFICATE-----..."
                  />
                  <FieldError id="credentials.certificateBody-error" errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.privateKey"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials.privateKey">
                    Private Key
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        The PEM-encoded private key matching the certificate. The private key is
                        never transmitted to Azure; it is only used locally to sign the client
                        assertion.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <SecretInput
                    aria-describedby={error ? "credentials.privateKey-error" : undefined}
                    id="credentials.privateKey"
                    isError={Boolean(error)}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="-----BEGIN PRIVATE KEY-----..."
                  />
                  <FieldError id="credentials.privateKey-error" errors={[error]} />
                </Field>
              )}
            />
          </>
        )}

        {selectedMethod === AzureKeyVaultConnectionMethod.ManagedIdentity && (
          <>
            <Controller
              name="credentials.tenantId"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials.tenantId">
                    Tenant ID
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        The Azure Active Directory (Entra ID) Tenant ID.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      setHasVerifyFailed(false);
                    }}
                    id="credentials.tenantId"
                    disabled={isNewConnection}
                    placeholder="00000000-0000-0000-0000-000000000000"
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.clientId"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials.clientId">Client ID</FieldLabel>
                  <Input
                    {...field}
                    onChange={(e) => {
                      field.onChange(e);
                      setHasVerifyFailed(false);
                    }}
                    id="credentials.clientId"
                    disabled={isNewConnection}
                    placeholder="00000000-0000-0000-0000-000000000000"
                    isError={Boolean(error)}
                  />
                  <FieldDescription>
                    The client ID of the user-assigned managed identity.
                  </FieldDescription>
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <div className="mb-4 flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
              <span className="text-sm font-medium">Federated Credential</span>
              {isUpdate ? (
                <>
                  <p className="text-xs leading-normal text-accent">
                    Add these values to the managed identity in Azure, then verify the connection.
                  </p>
                  {federatedCredential && (
                    <>
                      {federatedCredential.issuerUrl ? (
                        <CopyableValue label="Issuer" value={federatedCredential.issuerUrl} />
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          <span className="text-xs text-accent">Issuer</span>
                          <p className="text-xs leading-normal text-danger">
                            The issuer is unavailable because SITE_URL is not set. Set it to this
                            instance&apos;s public URL.
                          </p>
                        </div>
                      )}
                      <CopyableValue
                        label="Subject Identifier"
                        value={federatedCredential.subjectIdentifier}
                        className={GENERATED_VALUE_BORDER[scopeVariant]}
                      />
                      <CopyableValue label="Audience" value={federatedCredential.audience} />
                    </>
                  )}
                </>
              ) : (
                <>
                  <p className="text-xs leading-normal text-accent">
                    The subject identifier includes the connection ID, so Infisical creates the
                    connection first. Configure the federated credential to generate it.
                  </p>
                  <Button
                    type="submit"
                    size="sm"
                    variant={scopeVariant}
                    isPending={isSubmitting}
                    isDisabled={isSubmitting}
                  >
                    <KeyRoundIcon />
                    {isSubmitting ? "Creating Connection" : "Configure Federated Credential"}
                  </Button>
                </>
              )}
            </div>
          </>
        )}

        <SheetFooter className="sticky bottom-0 -mx-4 items-center border-t bg-popover">
          {isConfiguringManagedIdentity ? (
            <Button variant={scopeVariant} isDisabled>
              Create Connection
            </Button>
          ) : (
            <Button
              type="submit"
              variant={scopeVariant}
              isPending={isSubmitting || isRedirecting}
              isDisabled={
                isSubmitting ||
                (!isUpdate && !isDirty && selectedMethod !== AzureKeyVaultConnectionMethod.OAuth) ||
                isMissingConfig ||
                isRedirecting
              }
            >
              {submitLabel}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            isDisabled={isSubmitting || isRedirecting}
          >
            Cancel
          </Button>
          {isConfiguringManagedIdentity && (
            <span className="text-xs text-muted">Configure the federated credential first.</span>
          )}
        </SheetFooter>
      </form>
    </FormProvider>
  );
};
