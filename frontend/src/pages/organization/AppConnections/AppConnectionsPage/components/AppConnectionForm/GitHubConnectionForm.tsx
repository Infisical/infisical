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
  Select,
  SelectItem,
  Tooltip
} from "@app/components/v2";
import { useSubscription } from "@app/context";
import {
  OrgGatewayPermissionActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { isInfisicalCloud } from "@app/helpers/platform";
import { gatewaysQueryKeys } from "@app/hooks/api";
import {
  GitHubConnectionMethod,
  TGitHubConnection,
  useGetAppConnectionOption
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TGitHubConnection;
};

const formSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.GitHub),
  method: z.nativeEnum(GitHubConnectionMethod),
  credentials: z
    .object({
      host: z.string().optional()
    })
    .optional()
});

type FormData = z.infer<typeof formSchema>;

export const GitHubConnectionForm = ({ appConnection }: Props) => {
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
      gatewayId: null
    }
  });

  const {
    handleSubmit,
    control,
    watch,
    formState: { isSubmitting, isDirty }
  } = form;

  const { subscription } = useSubscription();
  const { data: gateways, isPending: isGatewaysLoading } = useQuery(gatewaysQueryKeys.list());

  const selectedMethod = watch("method");

  const onSubmit = (formData: FormData) => {
    setIsRedirecting(true);
    const state = crypto.randomBytes(16).toString("hex");
    localStorage.setItem("latestCSRFToken", state);
    localStorage.setItem(
      "githubConnectionFormData",
      JSON.stringify({ ...formData, connectionId: appConnection?.id })
    );

    const githubHost =
      formData.credentials?.host && formData.credentials.host.length > 0
        ? `https://${formData.credentials.host}`
        : "https://github.com";

    switch (formData.method) {
      case GitHubConnectionMethod.App:
        window.location.assign(
          `${githubHost}/apps/${appClientSlug}/installations/new?state=${state}`
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
    default:
      throw new Error(`Unhandled GitHub Connection method: ${selectedMethod}`);
  }

  const methodDetails = getAppConnectionMethodDetails(selectedMethod);

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
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
        {subscription.gateway && (
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="enterprise-options" className="data-[state=open]:border-none">
              <AccordionTrigger className="h-fit flex-none pl-1 text-sm">
                <div className="order-1 ml-3">GitHub Enterprise Options</div>
              </AccordionTrigger>
              <AccordionContent childrenClassName="px-0">
                <OrgPermissionCan
                  I={OrgGatewayPermissionActions.AttachGateways}
                  a={OrgPermissionSubjects.Gateway}
                >
                  {(isAllowed) => (
                    <Controller
                      control={control}
                      name="gatewayId"
                      defaultValue=""
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
                                value={value as string}
                                onValueChange={onChange}
                                className="w-full border border-mineshaft-500"
                                dropdownContainerClassName="max-w-none"
                                isLoading={isGatewaysLoading}
                                placeholder="Default: Internet Gateway"
                                position="popper"
                              >
                                <SelectItem
                                  value={null as unknown as string}
                                  onClick={() => onChange(undefined)}
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
                <Controller
                  name="credentials.host"
                  control={control}
                  shouldUnregister
                  render={({ field, fieldState: { error } }) => (
                    <FormControl
                      errorText={error?.message}
                      isError={Boolean(error?.message)}
                      label="Hostname"
                      isOptional
                    >
                      <Input {...field} placeholder="github.com" />
                    </FormControl>
                  )}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
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
            {isUpdate ? "Reconnect to GitHub" : "Connect to GitHub"}
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
