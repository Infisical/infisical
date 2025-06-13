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
  AzureDevOpsConnectionMethod,
  TAzureDevOpsConnection,
  useGetAppConnectionOption
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type AccessTokenForm = z.infer<typeof accessTokenSchema>;

type Props = {
  appConnection?: TAzureDevOpsConnection;
  onSubmit: (formData: AccessTokenForm) => Promise<void>;
};

// Base schema with common fields
const baseSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.AzureDevOps),
  method: z.nativeEnum(AzureDevOpsConnectionMethod)
});

// Method-specific schemas
const oauthSchema = baseSchema.extend({
  method: z.literal(AzureDevOpsConnectionMethod.OAuth),
  tenantId: z.string().trim().min(1, "Tenant ID is required"),
  orgName: z.string().trim().min(1, "Organization name is required")
});

const accessTokenSchema = baseSchema.extend({
  method: z.literal(AzureDevOpsConnectionMethod.AccessToken),
  credentials: z.object({
    accessToken: z.string().trim().min(1, "Access Token is required"),
    orgName: z.string().trim().min(1, "Organization name is required")
  })
});

// Union schema
const formSchema = z.discriminatedUnion("method", [oauthSchema, accessTokenSchema]);

type FormData = z.infer<typeof formSchema>;

const getDefaultValues = (appConnection?: TAzureDevOpsConnection): Partial<FormData> => {
  if (!appConnection) {
    return {
      app: AppConnection.AzureDevOps,
      method: AzureDevOpsConnectionMethod.OAuth
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
    case AzureDevOpsConnectionMethod.OAuth:
      if ("tenantId" in credentials && "orgName" in credentials) {
        return {
          ...base,
          method: AzureDevOpsConnectionMethod.OAuth,
          tenantId: credentials.tenantId,
          orgName: credentials.orgName
        };
      }
      break;
    case AzureDevOpsConnectionMethod.AccessToken:
      if ("accessToken" in credentials && "orgName" in credentials) {
        return {
          ...base,
          method: AzureDevOpsConnectionMethod.AccessToken,
          credentials: {
            accessToken: credentials.accessToken,
            orgName: credentials.orgName
          }
        };
      }
      break;
    default:
      return base;
  }

  return base;
};

export const AzureDevOpsConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const {
    option: { oauthClientId },
    isLoading
  } = useGetAppConnectionOption(AppConnection.AzureDevOps);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: getDefaultValues(appConnection)
  });

  const {
    handleSubmit,
    control,
    watch,
    formState: { isSubmitting, isDirty }
  } = form;

  const selectedMethod = watch("method");

  const onSubmitHandler = async (formData: FormData) => {
    switch (formData.method) {
      case AzureDevOpsConnectionMethod.OAuth:
        setIsRedirecting(true);
        const state = crypto.randomBytes(16).toString("hex");
        localStorage.setItem("latestCSRFToken", state);
        localStorage.setItem(
          "azureDevOpsConnectionFormData",
          JSON.stringify({ ...formData, connectionId: appConnection?.id })
        );

        window.location.assign(
          `https://login.microsoftonline.com/${formData.tenantId || "common"}/oauth2/v2.0/authorize?client_id=${oauthClientId}&response_type=code&redirect_uri=${window.location.origin}/organization/app-connections/azure/oauth/callback&response_mode=query&scope=https://azconfig.io/.default%20openid%20offline_access&state=${state}<:>azure-devops`
        );
        break;

      case AzureDevOpsConnectionMethod.AccessToken:
        onSubmit(formData);
        break;

      default:
        throw new Error(`Unhandled Azure Connection method: ${(formData as FormData).method}`);
    }
  };

  const isMissingConfig = selectedMethod === AzureDevOpsConnectionMethod.OAuth && !oauthClientId;
  const methodDetails = getAppConnectionMethodDetails(selectedMethod);

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmitHandler)} className="space-y-6">
        {!isUpdate && <GenericAppConnectionsFields />}

        <Controller
          name="method"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              tooltipText={`The method you would like to use to connect with ${
                APP_CONNECTION_MAP[AppConnection.AzureDevOps].name
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
                {Object.values(AzureDevOpsConnectionMethod).map((method) => {
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

        {/* OAuth-specific fields */}
        {selectedMethod === AzureDevOpsConnectionMethod.OAuth && (
          <>
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
                  <Input {...field} placeholder="e4f34ea5-ad23-4291-8585-66d20d603cc8" />
                </FormControl>
              )}
            />
            <Controller
              name="orgName"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  tooltipText="Your Azure DevOps organization name."
                  isError={Boolean(error?.message)}
                  label="Organization Name"
                  errorText={error?.message}
                >
                  <Input {...field} placeholder="myorganization" />
                </FormControl>
              )}
            />
          </>
        )}

        {/* Access Token-specific fields */}
        {selectedMethod === AzureDevOpsConnectionMethod.AccessToken && (
          <>
            <Controller
              name="credentials.accessToken"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  tooltipText="Personal Access Token from Azure DevOps."
                  isError={Boolean(error?.message)}
                  label="Access Token"
                  errorText={error?.message}
                >
                  <Input
                    {...field}
                    type="password"
                    placeholder="Enter your Personal Access Token"
                  />
                </FormControl>
              )}
            />
            <Controller
              name="credentials.orgName"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  tooltipText="Your Azure DevOps organization name."
                  isError={Boolean(error?.message)}
                  label="Organization Name"
                  errorText={error?.message}
                >
                  <Input {...field} placeholder="myorganization" />
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
