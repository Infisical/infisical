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
  AzureAppConfigurationConnectionMethod,
  TAzureAppConfigurationConnection,
  useGetAppConnectionOption
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AzureAppConfigurationFormData } from "../../../OauthCallbackPage/OauthCallbackPage.types";
import { useAppConnectionForm } from "./AppConnectionFormContext";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type ClientSecretForm = z.infer<typeof clientSecretSchema>;

type Props = {
  appConnection?: TAzureAppConfigurationConnection;
  onSubmit: (formData: ClientSecretForm) => Promise<void>;
  projectId: string | undefined | null;
};

const baseSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.AzureAppConfiguration),
  method: z.nativeEnum(AzureAppConfigurationConnectionMethod)
});

const oauthSchema = baseSchema.extend({
  tenantId: z.string().trim().min(1, "Tenant ID is required"),
  method: z.literal(AzureAppConfigurationConnectionMethod.OAuth)
});

const clientSecretSchema = baseSchema.extend({
  method: z.literal(AzureAppConfigurationConnectionMethod.ClientSecret),
  credentials: z.object({
    clientSecret: z.string().trim().min(1, "Client Secret is required"),
    clientId: z.string().trim().min(1, "Client ID is required"),
    tenantId: z.string().trim().min(1, "Tenant ID is required")
  })
});

const formSchema = z.discriminatedUnion("method", [oauthSchema, clientSecretSchema]);

type FormData = z.infer<typeof formSchema>;

const getDefaultValues = (appConnection?: TAzureAppConfigurationConnection): Partial<FormData> => {
  if (!appConnection) {
    return {
      app: AppConnection.AzureAppConfiguration,
      method: AzureAppConfigurationConnectionMethod.OAuth
    };
  }

  const base = {
    name: appConnection.name,
    description: appConnection.description,
    app: appConnection.app,
    method: appConnection.method
  };
  const { credentials } = appConnection;

  switch (appConnection.method) {
    case AzureAppConfigurationConnectionMethod.OAuth:
      if ("tenantId" in credentials) {
        return {
          ...base,
          method: AzureAppConfigurationConnectionMethod.OAuth,
          tenantId: credentials.tenantId
        };
      }
      break;
    case AzureAppConfigurationConnectionMethod.ClientSecret:
      if ("clientSecret" in credentials && "clientId" in credentials) {
        return {
          ...base,
          method: AzureAppConfigurationConnectionMethod.ClientSecret,
          credentials: {
            clientSecret: credentials.clientSecret,
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

export const AzureAppConfigurationConnectionForm = ({
  appConnection,
  onSubmit,
  projectId
}: Props) => {
  const isUpdate = Boolean(appConnection);
  const { onCancel } = useAppConnectionForm();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const {
    option: { oauthClientId },
    isLoading
  } = useGetAppConnectionOption(AppConnection.AzureAppConfiguration);

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
      case AzureAppConfigurationConnectionMethod.OAuth:
        setIsRedirecting(true);
        localStorage.setItem("latestCSRFToken", state);
        localStorage.setItem(
          "azureAppConfigurationConnectionFormData",
          JSON.stringify({
            ...formData,
            connectionId: appConnection?.id,
            projectId,
            returnUrl
          } as AzureAppConfigurationFormData)
        );
        window.location.assign(
          `https://login.microsoftonline.com/${formData.tenantId || "common"}/oauth2/v2.0/authorize?client_id=${oauthClientId}&response_type=code&redirect_uri=${window.location.origin}/organization/app-connections/azure/oauth/callback&response_mode=query&scope=https://azconfig.io/.default%20openid%20offline_access&state=${state}<:>azure-app-configuration`
        );
        break;
      case AzureAppConfigurationConnectionMethod.ClientSecret:
        await onSubmit(formData);
        break;
      default:
        throw new Error(`Unhandled Azure Connection method: ${(formData as FormData).method}`);
    }
  };

  let isMissingConfig: boolean;

  switch (selectedMethod) {
    case AzureAppConfigurationConnectionMethod.OAuth:
      isMissingConfig = !oauthClientId;
      break;
    case AzureAppConfigurationConnectionMethod.ClientSecret:
      isMissingConfig = false;
      break;
    default:
      throw new Error(`Unhandled Azure Connection method: ${selectedMethod}`);
  }

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
                    {APP_CONNECTION_MAP[AppConnection.AzureAppConfiguration].name}. This field
                    cannot be changed after creation.
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
                  {Object.values(AzureAppConfigurationConnectionMethod).map((method) => {
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
          name="tenantId"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="tenantId">
                Tenant ID
                {selectedMethod === AzureAppConfigurationConnectionMethod.OAuth && (
                  <span className="text-muted"> (optional)</span>
                )}
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
                onChange={(e) => {
                  field.onChange(e.target.value);
                  setValue("credentials.tenantId", e.target.value);
                }}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />

        {/* Client Secret-specific fields */}
        {selectedMethod === AzureAppConfigurationConnectionMethod.ClientSecret && (
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
