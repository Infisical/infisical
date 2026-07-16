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
  getAppConnectionMethodDetails,
  useGetAppConnectionOauthReturnUrl
} from "@app/helpers/appConnections";
import { isInfisicalCloud } from "@app/helpers/platform";
import { useScopeVariant } from "@app/hooks";
import { useGetAppConnectionOption } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { GitLabAccessTokenType } from "@app/hooks/api/appConnections/gitlab";
import {
  GitLabConnectionMethod,
  TGitLabConnection
} from "@app/hooks/api/appConnections/types/gitlab-connection";

import { GitLabFormData } from "../../../OauthCallbackPage/OauthCallbackPage.types";
import { useAppConnectionForm } from "./AppConnectionFormContext";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TGitLabConnection;
  onSubmit: (formData: FormData) => Promise<void>;
  projectId: string | undefined | null;
};

const formSchema = z.discriminatedUnion("method", [
  genericAppConnectionFieldsSchema.extend({
    app: z.literal(AppConnection.GitLab),
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
    app: z.literal(AppConnection.GitLab),
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

export const GitLabConnectionForm = ({ appConnection, onSubmit: formSubmit, projectId }: Props) => {
  const isUpdate = Boolean(appConnection);
  const { onCancel } = useAppConnectionForm();
  const scopeVariant = useScopeVariant();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const {
    option: { oauthClientId },
    isLoading
  } = useGetAppConnectionOption(AppConnection.GitLab);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues:
      appConnection?.method === GitLabConnectionMethod.OAuth
        ? { ...appConnection, credentials: { code: "custom" } }
        : (appConnection ??
          ({
            app: AppConnection.GitLab,
            method: GitLabConnectionMethod.AccessToken,
            credentials: {
              accessToken: "",
              accessTokenType: GitLabAccessTokenType.Personal,
              instanceUrl: ""
            }
          } as FormData))
  });

  const returnUrl = useGetAppConnectionOauthReturnUrl();

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
              isUpdate,
              projectId,
              returnUrl
            } as GitLabFormData)
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

  const getMethodErrorText = (fieldError?: { message?: string }) => {
    if (!isLoading && isMissingConfig && selectedMethod === GitLabConnectionMethod.OAuth) {
      return `${
        isInfisicalCloud()
          ? "GitLab Oauth is not supported in Infisical Cloud."
          : `Environment variables have not been configured. See Docs to configure GitLab ${methodDetails.name} Connections.`
      }`;
    }
    return fieldError?.message;
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}

        <Controller
          name="credentials.instanceUrl"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="gitlab-instance-url">
                Self-hosted URL <span className="text-muted">(optional)</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    Will default to GitLab Cloud if not specified.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="gitlab-instance-url"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="https://gitlab.com"
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
              <FieldLabel>
                Method
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The method you would like to use to connect with{" "}
                    {APP_CONNECTION_MAP[AppConnection.GitLab].name}. This field cannot be changed
                    after creation.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select
                disabled={isUpdate}
                value={value}
                onValueChange={(val) => {
                  onChange(val);
                  if (val === GitLabConnectionMethod.OAuth) {
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
                  {Object.values(GitLabConnectionMethod).map((method) => (
                    <SelectItem value={method} key={method}>
                      {getAppConnectionMethodDetails(method).name}{" "}
                      {method === GitLabConnectionMethod.AccessToken ? " (Recommended)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError>{getMethodErrorText(error)}</FieldError>
            </Field>
          )}
        />

        {selectedMethod === GitLabConnectionMethod.AccessToken && (
          <>
            <Controller
              name="credentials.accessTokenType"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel>Access Token Type</FieldLabel>
                  <Select
                    disabled={isUpdate}
                    value={value}
                    onValueChange={(val) => {
                      onChange(val);
                      if (val === GitLabConnectionMethod.OAuth) {
                        setValue("credentials.code", "custom");
                      }
                    }}
                  >
                    <SelectTrigger className="w-full" isError={Boolean(error?.message)}>
                      <SelectValue placeholder="Select a type..." />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {Object.values(GitLabAccessTokenType).map((method) => (
                        <SelectItem value={method} key={method}>
                          {method.charAt(0).toUpperCase() + method.slice(1)} Access Token
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.accessToken"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="gitlab-access-token">
                    Access Token
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">Your GitLab Access Token</TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <SecretInput value={value} onChange={(e) => onChange(e.target.value)} />
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
