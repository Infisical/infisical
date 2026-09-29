import crypto from "crypto";

import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import {
  Button,
  Field,
  FieldError,
  FieldLabel,
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
  StripeConnectionMethod,
  TStripeConnection
} from "@app/hooks/api/appConnections/types/stripe-connection";

import { useAppConnectionForm, useAppConnectionFormDirtyState } from "./AppConnectionFormContext";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";
import { Info } from "lucide-react";

type Props = {
  appConnection?: TStripeConnection;
  onSubmit: (formData: FormData) => Promise<void>;
  projectId: string | undefined | null;
};

const formSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Stripe),
  method: z.literal(StripeConnectionMethod.OAuth),
  credentials: z.object({
    code: z.string().min(1, "Code is required")
  })
});

type FormData = z.infer<typeof formSchema>;

export const StripeConnectionForm = ({ appConnection, projectId }: Props) => {
  const isUpdate = Boolean(appConnection);
  const { onCancel } = useAppConnectionForm();
  const scopeVariant = useScopeVariant();
  const [isRedirecting, setIsRedirecting] = useState(false);

  const returnUrl = useGetAppConnectionOauthReturnUrl();

  const {
    option: { oauthClientId, oauthAuthorizeUrl },
    isLoading
  } = useGetAppConnectionOption(AppConnection.Stripe);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    // The real code arrives from the Stripe redirect, so the form carries a placeholder to satisfy
    // the schema. This mirrors every other OAuth connection form.
    defaultValues: appConnection
      ? { ...appConnection, credentials: { code: "custom" } }
      : ({
          app: AppConnection.Stripe,
          method: StripeConnectionMethod.OAuth,
          credentials: { code: "custom" }
        } as FormData)
  });

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty }
  } = form;

  useAppConnectionFormDirtyState(isDirty);

  const isMissingConfig = !oauthClientId;

  let submitLabel = "Connect to Stripe";
  if (isRedirecting) submitLabel = "Redirecting to Stripe...";
  else if (isUpdate) submitLabel = "Reconnect to Stripe";

  const onSubmit = (formData: FormData) => {
    if (!oauthClientId || !oauthAuthorizeUrl) return;

    setIsRedirecting(true);

    const state = crypto.randomBytes(16).toString("hex");

    localStorage.setItem("latestCSRFToken", state);
    localStorage.setItem(
      "stripeConnectionFormData",
      JSON.stringify({
        ...formData,
        connectionId: appConnection?.id,
        returnUrl,
        projectId
      })
    );

    // The redirect URI is taken from the origin the user is actually on rather than from config,
    // so one Stripe app serves every deployment listing that origin in its manifest.
    const oauthUrl = new URL(oauthAuthorizeUrl);
    oauthUrl.searchParams.set("client_id", oauthClientId);
    oauthUrl.searchParams.set(
      "redirect_uri",
      `${window.location.origin}/organization/app-connections/stripe/oauth/callback`
    );
    oauthUrl.searchParams.set("state", state);

    window.location.assign(oauthUrl.toString());
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
                    {`The method you would like to use to connect with ${
                      APP_CONNECTION_MAP[AppConnection.Stripe].name
                    }. This field cannot be changed after creation.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(StripeConnectionMethod).map((method) => {
                    return (
                      <SelectItem value={method} key={method}>
                        {getAppConnectionMethodDetails(method).name}{" "}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />

        {!isLoading && isMissingConfig && (
          <p className="mb-4 text-sm text-red">
            Environment variables have not been configured.{" "}
            {isInfisicalCloud()
              ? "Please contact Infisical."
              : "See Docs to configure Stripe Connections."}
          </p>
        )}

        <SheetFooter className="sticky bottom-0 -mx-4 items-center border-t bg-popover">
          <Button
            type="submit"
            variant={scopeVariant}
            isPending={isSubmitting || isRedirecting}
            isDisabled={isSubmitting || (!isUpdate && !isDirty) || isMissingConfig || isRedirecting}
          >
            {submitLabel}
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
