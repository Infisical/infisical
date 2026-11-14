import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import {
  Field,
  FieldError,
  FieldLabel,
  Input,
  SecretInput,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  SnowflakeConnectionMethod,
  TSnowflakeConnection
} from "@app/hooks/api/appConnections/types/snowflake-connection";
import { snowflakeConnectionFormSchema as formSchema } from "@app/lib/schemas/app-connections";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import { GenericAppConnectionsFields } from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TSnowflakeConnection;
  onSubmit: (formData: FormData) => void;
};

type FormData = z.infer<typeof formSchema>;

export const SnowflakeConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.Snowflake,
      method: SnowflakeConnectionMethod.UsernameAndToken,
      credentials: {
        account: "",
        username: "",
        password: ""
      }
    }
  });

  const { handleSubmit, control } = form;

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}

        <Controller
          name="credentials.account"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="account">
                Account
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    Your Snowflake account identifier.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="account"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />

        <Controller
          name="credentials.username"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="username">
                Username
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The login name used to authenticate with Snowflake.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="username"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />

        <Controller
          name="credentials.password"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="password">
                Programmatic Access Token
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The Programmatic Access Token (PAT) used to authenticate with Snowflake.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <SecretInput
                aria-describedby={error ? "password-error" : undefined}
                isError={Boolean(error)}
                id="password"
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
              <FieldError id="password-error" errors={[error]} />
            </Field>
          )}
        />

        <AppConnectionFormFooter
          submitLabel={isUpdate ? "Update Credentials" : "Connect to Snowflake"}
        />
      </form>
    </FormProvider>
  );
};
