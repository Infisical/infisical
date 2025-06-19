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
  ModalClose,
  SecretInput,
  Select,
  SelectItem
} from "@app/components/v2";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { isInfisicalCloud } from "@app/helpers/platform";
import { useGetAppConnectionOption } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  HerokuConnectionMethod,
  THerokuConnection
} from "@app/hooks/api/appConnections/types/heroku-connection";

import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: THerokuConnection;
  onSubmit: (formData: FormData) => Promise<void>;
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

export const HerokuConnectionForm = ({ appConnection, onSubmit: formSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [isRedirecting, setIsRedirecting] = useState(false);

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
              isUpdate
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
                APP_CONNECTION_MAP[AppConnection.Heroku].name
              }. This field cannot be changed after creation.`}
              errorText={
                !isLoading && isMissingConfig && selectedMethod === HerokuConnectionMethod.OAuth
                  ? `Environment variables have not been configured. ${
                      isInfisicalCloud()
                        ? "Please contact Infisical."
                        : `See Docs to configure Heroku ${methodDetails.name} Connections.`
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
                  console.log("val", val === HerokuConnectionMethod.OAuth);
                  onChange(val);
                  if (val === HerokuConnectionMethod.OAuth) {
                    setValue("credentials.code", "custom");
                  }
                }}
                className="w-full border border-mineshaft-500"
                position="popper"
                dropdownContainerClassName="max-w-none"
              >
                {Object.values(HerokuConnectionMethod).map((method) => {
                  return (
                    <SelectItem value={method} key={method}>
                      {getAppConnectionMethodDetails(method).name}{" "}
                      {method === HerokuConnectionMethod.AuthToken ? " (Recommended)" : ""}
                    </SelectItem>
                  );
                })}
              </Select>
            </FormControl>
          )}
        />

        {selectedMethod === HerokuConnectionMethod.AuthToken && (
          <Controller
            name="credentials.authToken"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <FormControl
                label="Auth Token"
                errorText={error?.message}
                isError={Boolean(error?.message)}
                tooltipText="Your Heroku Auth Token"
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
