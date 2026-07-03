/* eslint-disable no-case-declarations */
/* eslint-disable no-nested-ternary */
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
  CSRF_TOKEN_STORAGE_KEY,
  getAppConnectionMethodDetails,
  GITEA_CONNECTION_FORM_STORAGE_KEY,
  useGetAppConnectionOauthReturnUrl
} from "@app/helpers/appConnections";
import { isInfisicalCloud } from "@app/helpers/platform";
import { useScopeVariant } from "@app/hooks";
import { AppConnection, useGetAppConnectionOption } from "@app/hooks/api/appConnections";
import {
  GiteaConnectionMethod,
  TGiteaConnection
} from "@app/hooks/api/appConnections/types/gitea-connection";

import { GiteaFormData } from "../../../OauthCallbackPage/OauthCallbackPage.types";
import { useAppConnectionForm } from "./AppConnectionFormContext";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

const formSchema = z.discriminatedUnion("method", [
  genericAppConnectionFieldsSchema.extend({
    app: z.literal(AppConnection.Gitea),
    method: z.literal(GiteaConnectionMethod.OAuth),
    credentials: z.object({
      instanceUrl: z.string().trim().url(),
      code: z.string().min(1, "Code is required")
    })
  }),
  genericAppConnectionFieldsSchema.extend({
    app: z.literal(AppConnection.Gitea),
    method: z.literal(GiteaConnectionMethod.PersonalAccessToken),
    credentials: z.object({
      instanceUrl: z.string().trim().url(),
      personalAccessToken: z.string().trim().min(1, "Access token is required")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

type Props = {
  appConnection?: TGiteaConnection;
  onSubmit: (formData: FormData) => Promise<void>;
  projectId: string | undefined | null;
};

export const GiteaConnectionForm = ({ appConnection, onSubmit: formSubmit, projectId }: Props) => {
  const isUpdate = Boolean(appConnection);
  const { onCancel } = useAppConnectionForm();
  const scopeVariant = useScopeVariant();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const {
    option: { oauthClientId },
    isLoading
  } = useGetAppConnectionOption(AppConnection.Gitea);

  const returnUrl = useGetAppConnectionOauthReturnUrl();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues:
      appConnection?.method === GiteaConnectionMethod.OAuth
        ? { ...appConnection, credentials: { code: "custom" } }
        : (appConnection ?? {
            app: AppConnection.Gitea,
            method: GiteaConnectionMethod.PersonalAccessToken
          })
  });

  const {
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { isSubmitting, isDirty }
  } = form;

  const selectedMethod = watch("method");
  const instanceUrl = watch("credentials.instanceUrl");

  let isMissingConfig: boolean;

  switch (selectedMethod) {
    case GiteaConnectionMethod.OAuth:
      isMissingConfig = !oauthClientId;
      break;
    case GiteaConnectionMethod.PersonalAccessToken:
      isMissingConfig = false;
      break;
    default:
      throw new Error(`Unhandled Gitea Connection method: ${selectedMethod}`);
  }

  const methodDetails = getAppConnectionMethodDetails(selectedMethod);

  const getMethodErrorText = (fieldError?: { message?: string }) => {
    if (!isLoading && isMissingConfig && selectedMethod === GiteaConnectionMethod.OAuth) {
      return `${
        isInfisicalCloud()
          ? "Gitea Oauth is not supported in Infisical Cloud."
          : `Environment variables have not been configured. See Docs to configure Gitea ${methodDetails.name} Connections.`
      }`;
    }
    return fieldError?.message;
  };

  const onSubmit = async (formData: FormData) => {
    try {
      switch (formData.method) {
        case GiteaConnectionMethod.PersonalAccessToken:
          await formSubmit(formData);
          break;

        case GiteaConnectionMethod.OAuth:
          if (!oauthClientId) {
            return;
          }
          setIsRedirecting(true);

          // Generate CSRF token
          const state = crypto.randomBytes(16).toString("hex");

          // Store state and form data for callback
          localStorage.setItem(CSRF_TOKEN_STORAGE_KEY, state);
          localStorage.setItem(
            GITEA_CONNECTION_FORM_STORAGE_KEY,
            JSON.stringify({
              ...formData,
              connectionId: appConnection?.id,
              isUpdate,
              projectId,
              returnUrl
            } as GiteaFormData)
          );

          // Redirect to Gitea OAuth
          const oauthUrl = new URL(`${instanceUrl}/login/oauth/authorize`);
          oauthUrl.searchParams.set("client_id", oauthClientId);
          oauthUrl.searchParams.set(
            "redirect_uri",
            `${window.location.origin}/organization/app-connections/gitea/oauth/callback`
          );
          oauthUrl.searchParams.set("response_type", "code");
          oauthUrl.searchParams.set("state", state);
          oauthUrl.searchParams.set("scope", "write:organization write:repository read:user");

          window.location.assign(oauthUrl.toString());
          break;

        default:
          throw new Error("Unhandled Gitea Connection method");
      }
    } catch (error) {
      console.error("Error handling form submission:", error);
      setIsRedirecting(false);
    }
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}

        <Controller
          name="credentials.instanceUrl"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="instance-url">Instance URL</FieldLabel>
              <Input
                id="instance-url"
                placeholder="https://<xyz>.gitea.cloud"
                value={value || ""}
                onChange={(e) => onChange(e.target.value)}
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />

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
                    {APP_CONNECTION_MAP[AppConnection.Gitea].name}. This field cannot be changed
                    after creation.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select
                disabled={isUpdate}
                value={value}
                onValueChange={(val) => {
                  onChange(val);
                  if (val === GiteaConnectionMethod.OAuth) {
                    setValue("credentials.code", "custom");
                  }
                }}
              >
                <SelectTrigger
                  className="w-full"
                  isError={Boolean(error?.message) || isMissingConfig}
                >
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(GiteaConnectionMethod).map((method) => {
                    return (
                      <SelectItem value={method} key={method}>
                        {getAppConnectionMethodDetails(method).name}{" "}
                        {method === GiteaConnectionMethod.PersonalAccessToken
                          ? " (Recommended)"
                          : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <FieldError>{getMethodErrorText(error)}</FieldError>
            </Field>
          )}
        />

        {selectedMethod === GiteaConnectionMethod.PersonalAccessToken && (
          <Controller
            name="credentials.personalAccessToken"
            control={control}
            shouldUnregister
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel htmlFor="api-key">Personal Access Token</FieldLabel>
                <SecretInput value={value} onChange={(e) => onChange(e.target.value)} />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        )}

        <SheetFooter className="sticky bottom-0 -mx-4 items-center border-t bg-popover">
          <Button
            type="submit"
            variant={scopeVariant}
            isPending={isSubmitting || isRedirecting}
            isDisabled={
              isSubmitting ||
              (!isUpdate && !isDirty) ||
              (isMissingConfig && selectedMethod === GiteaConnectionMethod.OAuth) ||
              isRedirecting
            }
          >
            {isRedirecting && selectedMethod === GiteaConnectionMethod.OAuth
              ? "Redirecting to Gitea..."
              : isUpdate
                ? "Reconnect to Gitea"
                : "Connect to Gitea"}
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
