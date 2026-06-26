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
import {
  HerokuConnectionMethod,
  THerokuConnection
} from "@app/hooks/api/appConnections/types/heroku-connection";

import { useAppConnectionForm } from "./AppConnectionFormContext";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: THerokuConnection;
  onSubmit: (formData: FormData) => Promise<void>;
  projectId: string | undefined | null;
};

const formSchema = z.discriminatedUnion("method", [
  genericAppConnectionFieldsSchema.extend({
    app: z.literal(AppConnection.Heroku),
    method: z.literal(HerokuConnectionMethod.AuthToken),
    credentials: z.object({
      authToken: z.string().min(1, "Auth token is required")
    })
  }),
  genericAppConnectionFieldsSchema.extend({
    app: z.literal(AppConnection.Heroku),
    method: z.literal(HerokuConnectionMethod.OAuth),
    credentials: z.object({
      code: z.string().min(1, "Code is required")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const HerokuConnectionForm = ({ appConnection, onSubmit: formSubmit, projectId }: Props) => {
  const isUpdate = Boolean(appConnection);
  const { onCancel } = useAppConnectionForm();
  const scopeVariant = useScopeVariant();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const returnUrl = useGetAppConnectionOauthReturnUrl();

  const {
    option: { oauthClientId },
    isLoading
  } = useGetAppConnectionOption(AppConnection.Heroku);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues:
      appConnection?.method === HerokuConnectionMethod.OAuth
        ? { ...appConnection, credentials: { code: "custom" } }
        : (appConnection ??
          ({
            app: AppConnection.Heroku,
            method: HerokuConnectionMethod.AuthToken,
            credentials: {
              authToken: ""
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

  const onSubmit = async (formData: FormData) => {
    try {
      switch (formData.method) {
        case HerokuConnectionMethod.AuthToken:
          await formSubmit(formData);
          break;

        case HerokuConnectionMethod.OAuth:
          if (!oauthClientId) {
            return;
          }
          setIsRedirecting(true);

          // Generate CSRF token
          const state = crypto.randomBytes(16).toString("hex");

          // Store state and form data for callback
          localStorage.setItem("latestCSRFToken", state);
          localStorage.setItem(
            "herokuConnectionFormData",
            JSON.stringify({
              ...formData,
              connectionId: appConnection?.id,
              returnUrl,
              projectId
            })
          );

          // Redirect to Heroku OAuth
          const oauthUrl = new URL("https://id.heroku.com/oauth/authorize");
          oauthUrl.searchParams.set("client_id", oauthClientId);
          oauthUrl.searchParams.set("response_type", "code");
          oauthUrl.searchParams.set("scope", "write-protected");
          oauthUrl.searchParams.set("state", state);

          window.location.assign(oauthUrl.toString());
          break;

        default:
          throw new Error("Unhandled Heroku Connection method");
      }
    } catch (error) {
      console.error("Error handling form submission:", error);
      setIsRedirecting(false);
    }
  };

  let isMissingConfig: boolean;

  switch (selectedMethod) {
    case HerokuConnectionMethod.OAuth:
      isMissingConfig = !oauthClientId;
      break;
    case HerokuConnectionMethod.AuthToken:
      isMissingConfig = false;
      break;
    default:
      throw new Error(`Unhandled Heroku Connection method: ${selectedMethod}`);
  }

  const methodDetails = getAppConnectionMethodDetails(selectedMethod);

  const getMethodErrorText = (fieldError?: { message?: string }) => {
    if (!isLoading && isMissingConfig && selectedMethod === HerokuConnectionMethod.OAuth) {
      return `Environment variables have not been configured. ${
        isInfisicalCloud()
          ? "Please contact Infisical."
          : `See Docs to configure Heroku ${methodDetails.name} Connections.`
      }`;
    }
    return fieldError?.message;
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}

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
                    {APP_CONNECTION_MAP[AppConnection.Heroku].name}. This field cannot be changed
                    after creation.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select
                disabled={isUpdate}
                value={value}
                onValueChange={(val) => {
                  onChange(val);
                  if (val === HerokuConnectionMethod.OAuth) {
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
                  {Object.values(HerokuConnectionMethod).map((method) => (
                    <SelectItem value={method} key={method}>
                      {getAppConnectionMethodDetails(method).name}{" "}
                      {method === HerokuConnectionMethod.AuthToken ? " (Recommended)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError>{getMethodErrorText(error)}</FieldError>
            </Field>
          )}
        />

        {selectedMethod === HerokuConnectionMethod.AuthToken && (
          <Controller
            name="credentials.authToken"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel htmlFor="heroku-auth-token">
                  Auth Token
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">Your Heroku Auth Token</TooltipContent>
                  </Tooltip>
                </FieldLabel>
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
              (isMissingConfig && selectedMethod === HerokuConnectionMethod.OAuth) ||
              isRedirecting
            }
          >
            {isRedirecting && selectedMethod === HerokuConnectionMethod.OAuth
              ? "Redirecting to Heroku..."
              : isUpdate
                ? "Reconnect to Heroku"
                : "Connect to Heroku"}
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
