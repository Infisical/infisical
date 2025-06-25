/* eslint-disable no-case-declarations */
/* eslint-disable no-nested-ternary */
import crypto from "crypto";

import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  Button,
  FormControl,
  Input,
  ModalClose,
  SecretInput,
  Select,
  SelectItem
} from "@app/components/v2";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { isInfisicalCloud } from "@app/helpers/platform";
import { useGetAppConnectionOption } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { GitLabAccessTokenType } from "@app/hooks/api/appConnections/gitlab";
import {
  GitLabConnectionMethod,
  TGitLabConnection
} from "@app/hooks/api/appConnections/types/gitlab-connection";

import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TGitLabConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const formSchema = z.discriminatedUnion("method", [
  genericAppConnectionFieldsSchema.extend({
    app: z.literal(AppConnection.Gitlab),
    method: z.literal(GitLabConnectionMethod.AccessToken),
    credentials: z.object({
      accessToken: z.string().min(1, "Access token is required"),
      accessTokenType: z.nativeEnum(GitLabAccessTokenType),
      instanceUrl: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .refine((value) => (!value ? true : z.string().url().safeParse(value).success), {
          message: "Invalid instance URL"
        })
        .optional()
    })
  }),
  genericAppConnectionFieldsSchema.extend({
    app: z.literal(AppConnection.Gitlab),
    method: z.literal(GitLabConnectionMethod.OAuth),
    credentials: z.object({
      code: z.string().min(1, "Code is required"),
      instanceUrl: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .refine((value) => (!value ? true : z.string().url().safeParse(value).success), {
          message: "Invalid instance URL"
        })
        .optional()
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const GitLabConnectionForm = ({ appConnection, onSubmit: formSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const {
    option: { oauthClientId },
    isLoading
  } = useGetAppConnectionOption(AppConnection.Gitlab);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues:
      appConnection?.method === GitLabConnectionMethod.OAuth
        ? { ...appConnection, credentials: { code: "custom" } }
        : (appConnection ??
          ({
            app: AppConnection.Gitlab,
            method: GitLabConnectionMethod.AccessToken,
            credentials: {
              accessToken: "",
              accessTokenType: GitLabAccessTokenType.Personal,
              instanceUrl: ""
            }
          } as FormData))
  });

  const {
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { isSubmitting, isDirty }
  } = form;

  const selectedMethod = watch("method");
  const gitLabURL = watch("credentials.instanceUrl");

  const onSubmit = async (formData: FormData) => {
    try {
      switch (formData.method) {
        case GitLabConnectionMethod.AccessToken:
          await formSubmit(formData);
          break;

        case GitLabConnectionMethod.OAuth:
          if (!oauthClientId) {
            return;
          }
          setIsRedirecting(true);

          // Generate CSRF token
          const state = crypto.randomBytes(16).toString("hex");

          // Store state and form data for callback
          localStorage.setItem("latestCSRFToken", state);
          localStorage.setItem(
            "gitlabConnectionFormData",
            JSON.stringify({
              ...formData,
              connectionId: appConnection?.id,
              isUpdate
            })
          );

          // Redirect to Gitlab OAuth
          const baseURL =
            gitLabURL && (gitLabURL as string)?.trim() !== ""
              ? (gitLabURL as string)?.trim()
              : "https://gitlab.com";
          const oauthUrl = new URL(`${baseURL}/oauth/authorize`);
          oauthUrl.searchParams.set("client_id", oauthClientId);
          oauthUrl.searchParams.set(
            "redirect_uri",
            `${window.location.origin}/organization/app-connections/gitlab/oauth/callback`
          );
          oauthUrl.searchParams.set("response_type", "code");
          oauthUrl.searchParams.set("state", state);

          window.location.assign(oauthUrl.toString());
          break;

        default:
          throw new Error("Unhandled GitLab Connection method");
      }
    } catch (error) {
      console.error("Error handling form submission:", error);
      setIsRedirecting(false);
    }
  };

  let isMissingConfig: boolean;

  switch (selectedMethod) {
    case GitLabConnectionMethod.OAuth:
      isMissingConfig = !oauthClientId;
      break;
    case GitLabConnectionMethod.AccessToken:
      isMissingConfig = false;
      break;
    default:
      throw new Error(`Unhandled GitLab Connection method: ${selectedMethod}`);
  }

  const methodDetails = getAppConnectionMethodDetails(selectedMethod);

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}

        <Controller
          name="credentials.instanceUrl"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              label="Self-hosted URL (optional)"
              errorText={error?.message}
              isError={Boolean(error?.message)}
              tooltipText="Will default to GitLab Cloud if not specified."
            >
              <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="https://gitlab.com"
              />
            </FormControl>
          )}
        />

        <Controller
          name="method"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              tooltipText={`The method you would like to use to connect with ${
                APP_CONNECTION_MAP[AppConnection.Gitlab].name
              }. This field cannot be changed after creation.`}
              errorText={
                !isLoading && isMissingConfig && selectedMethod === GitLabConnectionMethod.OAuth
                  ? `Environment variables have not been configured. ${
                      isInfisicalCloud()
                        ? "Please contact Infisical."
                        : `See Docs to configure GitLab ${methodDetails.name} Connections.`
                    }`
                  : error?.message
              }
              isError={Boolean(error?.message) || isMissingConfig}
              label="Method"
            >
              <Select
                isDisabled={isUpdate}
                value={value}
                onValueChange={(val) => {
                  onChange(val);
                  if (val === GitLabConnectionMethod.OAuth) {
                    setValue("credentials.code", "custom");
                  }
                }}
                className="w-full border border-mineshaft-500"
                position="popper"
                dropdownContainerClassName="max-w-none"
              >
                {Object.values(GitLabConnectionMethod).map((method) => {
                  return (
                    <SelectItem value={method} key={method}>
                      {getAppConnectionMethodDetails(method).name}{" "}
                      {method === GitLabConnectionMethod.AccessToken ? " (Recommended)" : ""}
                    </SelectItem>
                  );
                })}
              </Select>
            </FormControl>
          )}
        />

        {selectedMethod === GitLabConnectionMethod.AccessToken && (
          <>
            <Controller
              name="credentials.accessTokenType"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  label="Access Token Type"
                >
                  <Select
                    isDisabled={isUpdate}
                    value={value}
                    onValueChange={(val) => {
                      onChange(val);
                      if (val === GitLabConnectionMethod.OAuth) {
                        setValue("credentials.code", "custom");
                      }
                    }}
                    className="w-full border border-mineshaft-500"
                    position="popper"
                    dropdownContainerClassName="max-w-none"
                  >
                    {Object.values(GitLabAccessTokenType).map((method) => {
                      return (
                        <SelectItem value={method} key={method}>
                          {method.charAt(0).toUpperCase() + method.slice(1)} Access Token
                        </SelectItem>
                      );
                    })}
                  </Select>
                </FormControl>
              )}
            />
            <Controller
              name="credentials.accessToken"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <FormControl
                  label="Access Token"
                  errorText={error?.message}
                  isError={Boolean(error?.message)}
                  tooltipText="Your GitLab Access Token"
                >
                  <SecretInput
                    containerClassName="text-gray-400 group-focus-within:!border-primary-400/50 border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
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
            isDisabled={
              isSubmitting ||
              (!isUpdate && !isDirty) ||
              (isMissingConfig && selectedMethod === GitLabConnectionMethod.OAuth) ||
              isRedirecting
            }
          >
            {isRedirecting && selectedMethod === GitLabConnectionMethod.OAuth
              ? "Redirecting to GitLab..."
              : isUpdate
                ? "Reconnect to GitLab"
                : "Connect to GitLab"}
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
