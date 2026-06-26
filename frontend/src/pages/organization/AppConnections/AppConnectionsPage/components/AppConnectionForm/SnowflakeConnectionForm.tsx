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

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TSnowflakeConnection;
  onSubmit: (formData: FormData) => void;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Snowflake)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(SnowflakeConnectionMethod.UsernameAndToken),
    credentials: z.object({
      account: z.string().trim().min(1, "Account required"),
      username: z.string().trim().min(1, "Username required"),
      password: z.string().trim().min(1, "Programmatic Access Token required")
    })
  })
]);

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
              <SecretInput id="password" value={value} onChange={(e) => onChange(e.target.value)} />
              <FieldError errors={[error]} />
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
