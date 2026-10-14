import crypto from "crypto";

import { useState } from "react";
import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import {
  Button,
  DialogBody,
  DialogFooter,
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
import {
  GitHubRadarConnectionMethod,
  TGitHubRadarConnection,
  useGetAppConnectionOption
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { GitHubRadarFormData } from "../../../OauthCallbackPage/OauthCallbackPage.types";
import { useAppConnectionForm, useAppConnectionFormDirtyState } from "./AppConnectionFormContext";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TGitHubRadarConnection;
  projectId: string | undefined | null;
};

const formSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.GitHubRadar),
  method: z.nativeEnum(GitHubRadarConnectionMethod)
});

type FormData = z.infer<typeof formSchema>;

export const GitHubRadarConnectionForm = ({ appConnection, projectId }: Props) => {
  const isUpdate = Boolean(appConnection);
  const { onCancel, layout } = useAppConnectionForm();
  const scopeVariant = useScopeVariant();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const Body = layout === "dialog" ? DialogBody : "div";
  const Footer = layout === "dialog" ? DialogFooter : SheetFooter;

  const {
    option: { appClientSlug },
    isLoading
  } = useGetAppConnectionOption(AppConnection.GitHubRadar);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.GitHubRadar,
      method: GitHubRadarConnectionMethod.App
    }
  });

  const returnUrl = useGetAppConnectionOauthReturnUrl();

  const {
    handleSubmit,
    control,
    watch,
    formState: { isSubmitting, isDirty }
  } = form;

  useAppConnectionFormDirtyState(isDirty);

  const selectedMethod = watch("method");

  const onSubmit = (formData: FormData) => {
    setIsRedirecting(true);
    const state = crypto.randomBytes(16).toString("hex");
    localStorage.setItem("latestCSRFToken", state);
    localStorage.setItem(
      "githubRadarConnectionFormData",
      JSON.stringify({
        ...formData,
        connectionId: appConnection?.id,
        projectId,
        returnUrl
      } as GitHubRadarFormData)
    );

    switch (formData.method) {
      case GitHubRadarConnectionMethod.App:
        window.location.assign(
          `https://github.com/apps/${appClientSlug}/installations/new?state=${state}`
        );
        break;
      default:
        throw new Error(
          `Unhandled GitHub Radar Connection method: ${(formData as FormData).method}`
        );
    }
  };

  let isMissingConfig: boolean;

  switch (selectedMethod) {
    case GitHubRadarConnectionMethod.App:
      isMissingConfig = !appClientSlug;
      break;
    default:
      throw new Error(`Unhandled GitHub Radar Connection method: ${selectedMethod}`);
  }

  const methodDetails = getAppConnectionMethodDetails(selectedMethod);

  const getMethodErrorText = (fieldError?: { message?: string }) => {
    if (!isLoading && isMissingConfig) {
      return `Environment variables have not been configured. ${
        isInfisicalCloud()
          ? "Please contact Infisical."
          : `See Docs to configure GitHub Radar ${methodDetails.name} Connections.`
      }`;
    }
    return fieldError?.message;
  };

  return (
    <FormProvider {...form}>
      <form
        className={layout === "dialog" ? "flex min-h-0 flex-1 flex-col gap-6" : undefined}
        onSubmit={handleSubmit(onSubmit)}
      >
        <Body>
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
                      {APP_CONNECTION_MAP[AppConnection.GitHubRadar].name}. This field cannot be
                      changed after creation.
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                  <SelectTrigger
                    className="w-full"
                    isError={Boolean(error?.message) || isMissingConfig}
                  >
                    <SelectValue placeholder="Select a method..." />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {Object.values(GitHubRadarConnectionMethod).map((method) => (
                      <SelectItem value={method} key={method}>
                        {getAppConnectionMethodDetails(method).name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError>{getMethodErrorText(error)}</FieldError>
              </Field>
            )}
          />
        </Body>
        <Footer
          className={
            layout === "dialog"
              ? undefined
              : "sticky bottom-0 -mx-4 items-center border-t bg-popover"
          }
        >
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            isDisabled={isSubmitting || isRedirecting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant={layout === "dialog" ? "neutral" : scopeVariant}
            isPending={isSubmitting || isRedirecting}
            isDisabled={isSubmitting || (!isUpdate && !isDirty) || isMissingConfig || isRedirecting}
          >
            {isUpdate ? "Reconnect to GitHub" : "Connect to GitHub"}
          </Button>
        </Footer>
      </form>
    </FormProvider>
  );
};
