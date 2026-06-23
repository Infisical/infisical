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
  AzureDevOpsConnectionMethod,
  TAzureDevOpsConnection,
  useGetAppConnectionOption
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AzureDevOpsFormData } from "../../../OauthCallbackPage/OauthCallbackPage.types";
import { useAppConnectionForm } from "./AppConnectionFormContext";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

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

const clientSecretSchema = baseSchema.extend({
  method: z.literal(AzureDevOpsConnectionMethod.ClientSecret),
  credentials: z.object({
    clientSecret: z.string().trim().min(1, "Client Secret is required"),
    tenantId: z.string().trim().min(1, "Tenant ID is required"),
    clientId: z.string().trim().min(1, "Client ID is required"),
    orgName: z.string().trim().min(1, "Organization name is required")
  })
});

// Union schema
const formSchema = z.discriminatedUnion("method", [
  oauthSchema,
  accessTokenSchema,
  clientSecretSchema
]);

type FormData = z.infer<typeof formSchema>;
type OnSubmitForm = z.infer<typeof accessTokenSchema> | z.infer<typeof clientSecretSchema>;

type Props = {
  appConnection?: TAzureDevOpsConnection;
  onSubmit: (formData: OnSubmitForm) => Promise<void>;
  projectId: string | undefined | null;
};

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
    case AzureDevOpsConnectionMethod.ClientSecret:
      if (
        "clientSecret" in credentials &&
        "tenantId" in credentials &&
        "clientId" in credentials &&
        "orgName" in credentials
      ) {
        return {
          ...base,
          method: AzureDevOpsConnectionMethod.ClientSecret,
          credentials: {
            clientSecret: credentials.clientSecret,
            tenantId: credentials.tenantId,
            clientId: credentials.clientId,
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

export const AzureDevOpsConnectionForm = ({ appConnection, onSubmit, projectId }: Props) => {
  const isUpdate = Boolean(appConnection);
  const { onCancel } = useAppConnectionForm();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const {
    option: { oauthClientId },
    isLoading
  } = useGetAppConnectionOption(AppConnection.AzureDevOps);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: getDefaultValues(appConnection)
  });

  const returnUrl = useGetAppConnectionOauthReturnUrl();

  const {
    handleSubmit,
    control,
    watch,
    formState: { isSubmitting, isDirty },
    setValue
  } = form;

  const scopeVariant = useScopeVariant();

  const selectedMethod = watch("method");

  const onSubmitHandler = async (formData: FormData) => {
    switch (formData.method) {
      case AzureDevOpsConnectionMethod.OAuth:
        setIsRedirecting(true);
        const state = crypto.randomBytes(16).toString("hex");
        localStorage.setItem("latestCSRFToken", state);
        localStorage.setItem(
          "azureDevOpsConnectionFormData",
          JSON.stringify({
            ...formData,
            connectionId: appConnection?.id,
            projectId,
            returnUrl
          } as AzureDevOpsFormData)
        );

        window.location.assign(
          `https://login.microsoftonline.com/${formData.tenantId || "common"}/oauth2/v2.0/authorize?client_id=${oauthClientId}&response_type=code&redirect_uri=${window.location.origin}/organization/app-connections/azure/oauth/callback&response_mode=query&scope=https://azconfig.io/.default%20openid%20offline_access&state=${state}<:>azure-devops`
        );
        break;
      case AzureDevOpsConnectionMethod.AccessToken:
        await onSubmit(formData);
        break;
      case AzureDevOpsConnectionMethod.ClientSecret:
        await onSubmit(formData);
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
            <Field className="mb-4">
              <FieldLabel htmlFor="method">
                Method
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The method you would like to use to connect with{" "}
                    {APP_CONNECTION_MAP[AppConnection.AzureDevOps].name}. This field cannot be
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
                  {Object.values(AzureDevOpsConnectionMethod).map((method) => {
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

        {(selectedMethod === AzureDevOpsConnectionMethod.OAuth ||
          selectedMethod === AzureDevOpsConnectionMethod.ClientSecret) && (
          <>
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
                        The Directory (tenant) ID.
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
            <Controller
              name="orgName"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="orgName">
                    Organization Name
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        Your Azure DevOps organization name.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input
                    {...field}
                    id="orgName"
                    placeholder="myorganization"
                    isError={Boolean(error)}
                    onChange={(e) => {
                      field.onChange(e.target.value);
                      setValue("credentials.orgName", e.target.value);
                    }}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </>
        )}

        {/* Client Secret-specific fields */}
        {selectedMethod === AzureDevOpsConnectionMethod.ClientSecret && (
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

        {/* Access Token-specific fields */}
        {selectedMethod === AzureDevOpsConnectionMethod.AccessToken && (
          <>
            <Controller
              name="credentials.accessToken"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials.accessToken">
                    Access Token
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        Personal Access Token from Azure DevOps.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input
                    {...field}
                    id="credentials.accessToken"
                    type="password"
                    placeholder="Enter your Personal Access Token"
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.orgName"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="credentials.orgName">
                    Organization Name
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        Your Azure DevOps organization name.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input
                    {...field}
                    id="credentials.orgName"
                    placeholder="myorganization"
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
