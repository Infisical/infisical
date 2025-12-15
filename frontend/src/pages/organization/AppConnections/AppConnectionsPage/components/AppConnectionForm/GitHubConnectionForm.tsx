import crypto from "crypto";

import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Button,
  FormControl,
  Input,
  ModalClose,
  SecretInput,
  Select,
  SelectItem,
  Tooltip
} from "@app/components/v2";
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
import { gatewaysQueryKeys } from "@app/hooks/api";
import {
  GitHubConnectionMethod,
  TGitHubConnection,
  useGetAppConnectionOption
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";

import { GitHubFormData } from "../../../OauthCallbackPage/OauthCallbackPage.types";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TGitHubConnection;
  projectId: string | undefined | null;
  onSubmit: (formData: PatSchemaForm) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.GitHub),
  method: z.nativeEnum(GitHubConnectionMethod)
});

const baseCredentialsSchema = z.union([
  z.object({
    instanceType: z.literal("server"),
    host: z.string().min(1, "Host is required for server instance type")
  }),
  z.object({
    instanceType: z.literal("cloud").optional(),
    host: z.string().optional()
  })
]);

const appSchema = rootSchema.extend({
  method: z.literal(GitHubConnectionMethod.App),
  credentials: baseCredentialsSchema
});

const oauthSchema = rootSchema.extend({
  method: z.literal(GitHubConnectionMethod.OAuth),
  credentials: baseCredentialsSchema
});

const patSchema = rootSchema.extend({
  method: z.literal(GitHubConnectionMethod.Pat),
  credentials: z.union([
    z.object({
      instanceType: z.literal("server"),
      host: z.string().min(1, "Host is required for server instance type"),
      personalAccessToken: z.string().min(1, "Personal Access Token is required")
    }),
    z.object({
      instanceType: z.literal("cloud").optional(),
      host: z.string().optional(),
      personalAccessToken: z.string().min(1, "Personal Access Token is required")
    })
  ])
});

type PatSchemaForm = z.infer<typeof patSchema>;

const formSchema = z.discriminatedUnion("method", [appSchema, oauthSchema, patSchema]);

type FormData = z.infer<typeof formSchema>;

export const GitHubConnectionForm = ({ appConnection, projectId, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const {
    option: { oauthClientId, appClientSlug },
    isLoading
  } = useGetAppConnectionOption(AppConnection.GitHub);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.GitHub,
      method: GitHubConnectionMethod.App,
      gatewayId: null,
      credentials: {
        instanceType: "cloud"
      }
    }
  });

  const {
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { isSubmitting, isDirty }
  } = form;

  const { subscription } = useSubscription();
  const { data: gateways, isPending: isGatewaysLoading } = useQuery(gatewaysQueryKeys.list());

  const selectedMethod = watch("method");
  const instanceType = watch("credentials.instanceType");

  const returnUrl = useGetAppConnectionOauthReturnUrl();

  const submitHandler = async (formData: FormData) => {
    if (formData.method === GitHubConnectionMethod.Pat) {
      await onSubmit(formData);
      return;
    }

    setIsRedirecting(true);
    const state = crypto.randomBytes(16).toString("hex");
    localStorage.setItem("latestCSRFToken", state);
    localStorage.setItem(
      "githubConnectionFormData",
      JSON.stringify({
        ...formData,
        credentials: formData.credentials as TGitHubConnection["credentials"],
        connectionId: appConnection?.id,
        projectId,
        returnUrl
      } as GitHubFormData)
    );

    const githubHost =
      formData.credentials?.host && formData.credentials.host.length > 0
        ? `https://${formData.credentials.host}`
        : "https://github.com";

    switch (formData.method) {
      case GitHubConnectionMethod.App:
        window.location.assign(
          `${githubHost}/${formData.credentials?.instanceType === "server" ? "github-apps" : "apps"}/${appClientSlug}/installations/new?state=${state}`
        );
        break;
      case GitHubConnectionMethod.OAuth:
        window.location.assign(
          `${githubHost}/login/oauth/authorize?client_id=${oauthClientId}&response_type=code&scope=repo,admin:org&redirect_uri=${window.location.origin}/organization/app-connections/github/oauth/callback&state=${state}`
        );
        break;
      default:
        throw new Error(`Unhandled GitHub Connection method: ${(formData as FormData).method}`);
    }
  };

  let isMissingConfig: boolean;

  switch (selectedMethod) {
    case GitHubConnectionMethod.OAuth:
      isMissingConfig = !oauthClientId;
      break;
    case GitHubConnectionMethod.App:
      isMissingConfig = !appClientSlug;
      break;
    case GitHubConnectionMethod.Pat:
      isMissingConfig = false;
      break;
    default:
      throw new Error(`Unhandled GitHub Connection method: ${selectedMethod}`);
  }

  const methodDetails = getAppConnectionMethodDetails(selectedMethod);

  const getButtonText = () => {
    if (selectedMethod === GitHubConnectionMethod.Pat) {
      return isUpdate ? "Update Connection" : "Create Connection";
    }

    return isUpdate ? "Reconnect to GitHub" : "Connect to GitHub";
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(submitHandler)}>
        {!isUpdate && <GenericAppConnectionsFields />}
        <Controller
          name="method"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              tooltipText={`The method you would like to use to connect with ${
                APP_CONNECTION_MAP[AppConnection.GitHub].name
              }. This field cannot be changed after creation.`}
              errorText={
                !isLoading && isMissingConfig
                  ? `Credentials have not been configured. ${
                      isInfisicalCloud()
                        ? "Please contact Infisical."
                        : `See Docs to configure Github ${methodDetails.name} Connections.`
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
                {Object.values(GitHubConnectionMethod).map((method) => {
                  return (
                    <SelectItem value={method} key={method}>
                      {getAppConnectionMethodDetails(method).name}{" "}
                      {method === GitHubConnectionMethod.App ? " (Recommended)" : ""}
                    </SelectItem>
                  );
                })}
              </Select>
            </FormControl>
          )}
        />
        {selectedMethod === GitHubConnectionMethod.Pat && (
          <Controller
            name="credentials.personalAccessToken"
            control={control}
            shouldUnregister
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                errorText={error?.message}
                isError={Boolean(error?.message)}
                label="Personal Access Token"
              >
                <SecretInput
                  containerClassName="text-gray-400 group-focus-within:!border-primary-400/50 border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                />
              </FormControl>
            )}
          />
        )}
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="enterprise-options" className="data-[state=open]:border-none">
            <AccordionTrigger className="h-fit flex-none pl-1 text-sm">
              <div className="order-1 ml-3">GitHub Enterprise Options</div>
            </AccordionTrigger>
            <AccordionContent childrenClassName="px-0">
              <Controller
                name="credentials.instanceType"
                control={control}
                render={({ field }) => (
                  <FormControl label="Instance Type">
                    <Select
                      value={field.value}
                      onValueChange={(e) => {
                        field.onChange(e);
                        if (e === "cloud") {
                          setValue("gatewayId", null);
                        }
                      }}
                      className="w-full border border-mineshaft-500"
                      dropdownContainerClassName="max-w-none"
                      placeholder="Enterprise Cloud"
                      position="popper"
                    >
                      <SelectItem value="cloud">Enterprise Cloud</SelectItem>
                      <SelectItem value="server">Enterprise Server</SelectItem>
                    </Select>
                  </FormControl>
                )}
              />

              <Controller
                name="credentials.host"
                control={control}
                shouldUnregister
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    errorText={error?.message}
                    isError={Boolean(error?.message)}
                    label="Instance Hostname"
                    isOptional={instanceType === "cloud"}
                    isRequired={instanceType === "server"}
                  >
                    <Input {...field} placeholder="github.com" />
                  </FormControl>
                )}
              />
              {subscription.get(SubscriptionProductCategory.Platform, "gateway") &&
                instanceType === "server" && (
                  <OrgPermissionCan
                    I={OrgGatewayPermissionActions.AttachGateways}
                    a={OrgPermissionSubjects.Gateway}
                  >
                    {(isAllowed) => (
                      <Controller
                        control={control}
                        name="gatewayId"
                        render={({ field: { value, onChange }, fieldState: { error } }) => (
                          <FormControl
                            isError={Boolean(error?.message)}
                            errorText={error?.message}
                            label="Gateway"
                          >
                            <Tooltip
                              isDisabled={isAllowed}
                              content="Restricted access. You don't have permission to attach gateways to resources."
                            >
                              <div>
                                <Select
                                  isDisabled={!isAllowed}
                                  value={value || (null as unknown as string)}
                                  onValueChange={onChange}
                                  className="w-full border border-mineshaft-500"
                                  dropdownContainerClassName="max-w-none"
                                  isLoading={isGatewaysLoading}
                                  placeholder="Default: Internet Gateway"
                                  position="popper"
                                >
                                  <SelectItem
                                    value={null as unknown as string}
                                    onClick={() => onChange(null)}
                                  >
                                    Internet Gateway
                                  </SelectItem>
                                  {gateways?.map((el) => (
                                    <SelectItem value={el.id} key={el.id}>
                                      {el.name}
                                    </SelectItem>
                                  ))}
                                </Select>
                              </div>
                            </Tooltip>
                          </FormControl>
                        )}
                      />
                    )}
                  </OrgPermissionCan>
                )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <div className="mt-8 flex items-center">
          <Button
            className="mr-4"
            size="sm"
            type="submit"
            colorSchema="secondary"
            isLoading={isSubmitting || isRedirecting}
            isDisabled={isSubmitting || (!isUpdate && !isDirty) || isMissingConfig || isRedirecting}
          >
            {getButtonText()}
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
