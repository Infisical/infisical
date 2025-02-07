import crypto from "crypto";

import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, ModalClose, Select, SelectItem } from "@app/components/v2";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { isInfisicalCloud } from "@app/helpers/platform";
import {
  AzureAppConfigurationConnectionMethod,
  TAzureAppConfigurationConnection,
  useGetAppConnectionOption
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TAzureAppConfigurationConnection;
};

const formSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.AzureAppConfiguration),
  method: z.nativeEnum(AzureAppConfigurationConnectionMethod),
  tenantId: z.string().trim().optional()
});

type FormData = z.infer<typeof formSchema>;

export const AzureAppConfigurationConnectionForm = ({ appConnection }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const {
    option: { oauthClientId },
    isLoading
  } = useGetAppConnectionOption(AppConnection.AzureAppConfiguration);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection
      ? {
          ...appConnection,
          tenantId: appConnection.credentials.tenantId
        }
      : {
          app: AppConnection.AzureAppConfiguration,
          method: AzureAppConfigurationConnectionMethod.OAuth
        }
  });

  const {
    handleSubmit,
    control,
    watch,
    formState: { isSubmitting, isDirty }
  } = form;

  const selectedMethod = watch("method");

  const onSubmit = (formData: FormData) => {
    setIsRedirecting(true);
    const state = crypto.randomBytes(16).toString("hex");
    localStorage.setItem("latestCSRFToken", state);
    localStorage.setItem(
      "azureAppConfigurationConnectionFormData",
      JSON.stringify({ ...formData, connectionId: appConnection?.id })
    );

    switch (formData.method) {
      case AzureAppConfigurationConnectionMethod.OAuth:
        window.location.assign(
          `https://login.microsoftonline.com/${formData.tenantId || "common"}/oauth2/v2.0/authorize?client_id=${oauthClientId}&response_type=code&redirect_uri=${window.location.origin}/organization/app-connections/azure/oauth/callback&response_mode=query&scope=https://azconfig.io/.default%20openid%20offline_access&state=${state}<:>azure-app-configuration`
        );
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
    default:
      throw new Error(`Unhandled Azure Connection method: ${selectedMethod}`);
  }

  const methodDetails = getAppConnectionMethodDetails(selectedMethod);

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}

        <Controller
          name="tenantId"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              tooltipText="The Azure Active Directory (Entra ID) Tenant ID."
              isError={Boolean(error?.message)}
              label="Tenant ID"
              isOptional
              errorText={error?.message}
            >
              <Input {...field} placeholder="e4f34ea5-ad23-4291-8585-66d20d603cc8" />
            </FormControl>
          )}
        />

        <Controller
          name="method"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              tooltipText={`The method you would like to use to connect with ${
                APP_CONNECTION_MAP[AppConnection.AzureAppConfiguration].name
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
                {Object.values(AzureAppConfigurationConnectionMethod).map((method) => {
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
