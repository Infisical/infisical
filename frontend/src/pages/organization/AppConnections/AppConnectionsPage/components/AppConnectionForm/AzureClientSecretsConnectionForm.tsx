/* eslint-disable no-case-declarations */
import crypto from "crypto";

import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, ModalClose, Select, SelectItem } from "@app/components/v2";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { isInfisicalCloud } from "@app/helpers/platform";
import {
  AzureClientSecretsConnectionMethod,
  TAzureClientSecretsConnection,
  useGetAppConnectionOption
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type ClientSecretForm = z.infer<typeof clientSecretSchema>;

type Props = {
  appConnection?: TAzureClientSecretsConnection;
  onSubmit: (formData: ClientSecretForm) => Promise<void>;
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
    tenantId: z.string().trim().min(1, "Tenant ID is required")
  })
});

const formSchema = z.discriminatedUnion("method", [oauthSchema, clientSecretSchema]);

type FormData = z.infer<typeof formSchema>;

const getDefaultValues = (appConnection?: TAzureClientSecretsConnection): Partial<FormData> => {
  if (!appConnection) {
    return {
      app: AppConnection.AzureClientSecrets,
      method: AzureClientSecretsConnectionMethod.OAuth
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
      if ("clientSecret" in credentials && "clientId" in credentials) {
        return {
          ...base,
          method: AzureClientSecretsConnectionMethod.ClientSecret,
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

export const AzureClientSecretsConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const {
    option: { oauthClientId },
    isLoading
  } = useGetAppConnectionOption(AppConnection.AzureClientSecrets);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: getDefaultValues(appConnection)
  });

  const {
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { isSubmitting, isDirty }
  } = form;

  const selectedMethod = watch("method");

  const onSubmitHandler = async (formData: FormData) => {
    const state = crypto.randomBytes(16).toString("hex");
    switch (formData.method) {
      case AzureClientSecretsConnectionMethod.OAuth:
        setIsRedirecting(true);
        localStorage.setItem("latestCSRFToken", state);
        localStorage.setItem(
          "azureClientSecretsConnectionFormData",
          JSON.stringify({ ...formData, connectionId: appConnection?.id })
        );
        window.location.assign(
          `https://login.microsoftonline.com/${formData.tenantId || "common"}/oauth2/v2.0/authorize?client_id=${oauthClientId}&response_type=code&redirect_uri=${window.location.origin}/organization/app-connections/azure/oauth/callback&response_mode=query&scope=https://graph.microsoft.com/.default%20openid%20offline_access&state=${state}<:>azure-client-secrets`
        );
        break;

      case AzureClientSecretsConnectionMethod.ClientSecret:
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
            <FormControl
              tooltipText={`The method you would like to use to connect with ${
                APP_CONNECTION_MAP[AppConnection.AzureClientSecrets].name
              }. This field cannot be changed after creation.`}
              errorText={
                !isLoading && isMissingConfig
                  ? `Environment variables have not been configured. ${
                      isInfisicalCloud()
                        ? "Please contact Infisical."
                        : `See documentation to configure Azure ${methodDetails.name} Connections.`
                    }`
                  : error?.message
              }
              isError={Boolean(error?.message) || isMissingConfig}
              label="Method"
            >
              <Select
                isDisabled={isUpdate}
                value={value}
                onValueChange={(val) => onChange(val)}
                className="w-full border border-mineshaft-500"
                position="popper"
                dropdownContainerClassName="max-w-none"
              >
                {Object.values(AzureClientSecretsConnectionMethod).map((method) => {
                  return (
                    <SelectItem value={method} key={method}>
                      {getAppConnectionMethodDetails(method).name}
                    </SelectItem>
                  );
                })}
              </Select>
            </FormControl>
          )}
        />

        <Controller
          name="tenantId"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              tooltipText="The Directory (tenant) ID."
              isError={Boolean(error?.message)}
              label="Tenant ID"
              errorText={error?.message}
            >
              <Input
                {...field}
                placeholder="00000000-0000-0000-0000-000000000000"
                onChange={(e) => {
                  field.onChange(e.target.value);
                  setValue("credentials.tenantId", e.target.value);
                }}
              />
            </FormControl>
          )}
        />

        {/* Access Token-specific fields */}
        {selectedMethod === AzureClientSecretsConnectionMethod.ClientSecret && (
          <>
            <Controller
              name="credentials.clientId"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  isError={Boolean(error?.message)}
                  label="Client ID"
                  errorText={error?.message}
                >
                  <Input {...field} placeholder="00000000-0000-0000-0000-000000000000" />
                </FormControl>
              )}
            />
            <Controller
              name="credentials.clientSecret"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  isError={Boolean(error?.message)}
                  label="Client Secret"
                  errorText={error?.message}
                >
                  <Input
                    {...field}
                    type="password"
                    placeholder="~JzD8e6S.tH~w8XRaNnKcb7W1fM4rCns7FY"
                  />
                </FormControl>
              )}
            />
          </>
        )}

        <div className="mt-8 flex items-center">
          <Button
            className="mr-4"
            size="sm"
            type="submit"
            colorSchema="secondary"
            isLoading={isSubmitting || isRedirecting}
            isDisabled={isSubmitting || (!isUpdate && !isDirty) || isMissingConfig || isRedirecting}
          >
            {isUpdate ? "Reconnect to Azure" : "Connect to Azure"}
          </Button>
          <ModalClose asChild>
            <Button colorSchema="secondary" variant="plain">
              Cancel
            </Button>
          </ModalClose>
        </div>
      </form>
    </FormProvider>
  );
};
