import crypto from "crypto";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, ModalClose, Select, SelectItem } from "@app/components/v2";
import { APP_CONNECTION_MAP, APP_CONNECTION_METHOD_MAP } from "@app/helpers/appConnections";
import {
  GitHubConnectionMethod,
  TGitHubConnection,
  useGetAppConnectionOption
} from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { slugSchema } from "@app/lib/schemas";

type Props = {
  appConnection?: TGitHubConnection;
};

const rootSchema = z.object({
  name: slugSchema({ min: 1, max: 32, field: "Name" }),
  app: z.literal(AppConnection.GitHub)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(GitHubConnectionMethod.App)
  }),
  rootSchema.extend({
    method: z.literal(GitHubConnectionMethod.OAuth)
  })
]);

type FormData = z.infer<typeof formSchema>;

export const GitHubConnectionForm = ({ appConnection }: Props) => {
  const isUpdate = Boolean(appConnection);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const {
    option: { oauthClientId, appClientSlug },
    isLoading
  } = useGetAppConnectionOption(AppConnection.GitHub);

  const {
    handleSubmit,
    register,
    control,
    watch,
    formState: { isSubmitting, errors, isDirty }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.GitHub,
      method: GitHubConnectionMethod.App
    }
  });

  const selectedMethod = watch("method");

  const onSubmit = (formData: FormData) => {
    setIsRedirecting(true);
    const state = crypto.randomBytes(16).toString("hex");
    localStorage.setItem("latestCSRFToken", state);
    localStorage.setItem(
      "githubConnectionFormData",
      JSON.stringify({ ...formData, connectionId: appConnection?.id })
    );

    switch (formData.method) {
      case GitHubConnectionMethod.App:
        window.location.assign(
          `https://github.com/apps/${appClientSlug}/installations/new?state=${state}`
        );
        break;
      case GitHubConnectionMethod.OAuth:
        window.location.assign(
          `https://github.com/login/oauth/authorize?client_id=${oauthClientId}&response_type=code&scope=repo,admin:org&redirect_uri=${window.location.origin}/app-connections/github/oauth/callback&state=${state}`
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

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {!isUpdate && (
        <FormControl
          helperText="Name must be slug-friendly"
          errorText={errors.name?.message}
          isError={Boolean(errors.name?.message)}
          label="Name"
        >
          <Input
            autoFocus
            placeholder={`my-${AppConnection.GitHub}-connection`}
            {...register("name")}
          />
        </FormControl>
      )}
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
                ? `Environment variables have not been configured. See Docs to configure GitHub ${APP_CONNECTION_METHOD_MAP[selectedMethod].name} Connections.`
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
                    {APP_CONNECTION_METHOD_MAP[method].name}{" "}
                    {method === GitHubConnectionMethod.App ? " (Recommended)" : ""}
                  </SelectItem>
                );
              })}
            </Select>
          </FormControl>
        )}
      />
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
  );
};
