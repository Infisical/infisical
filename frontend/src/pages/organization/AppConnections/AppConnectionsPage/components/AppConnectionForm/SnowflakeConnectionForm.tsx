import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, ModalClose, SecretInput } from "@app/components/v2";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  SnowflakeConnectionMethod,
  TSnowflakeConnection
} from "@app/hooks/api/appConnections/types/snowflake-connection";

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

  const {
    handleSubmit,
    control,
    formState: { isSubmitting, isDirty }
  } = form;

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}

        <Controller
          name="credentials.account"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Account"
              tooltipText="Your Snowflake account identifier."
            >
              <Input value={value} onChange={(e) => onChange(e.target.value)} />
            </FormControl>
          )}
        />

        <Controller
          name="credentials.username"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Username"
              tooltipText="The login name used to authenticate with Snowflake."
            >
              <Input value={value} onChange={(e) => onChange(e.target.value)} />
            </FormControl>
          )}
        />

        <Controller
          name="credentials.password"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Programmatic Access Token"
              tooltipText="The Programmatic Access Token (PAT) used to authenticate with Snowflake."
            >
              <SecretInput
                containerClassName="text-gray-400 group-focus-within:border-primary-400/50! border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
            </FormControl>
          )}
        />

        <div className="mt-8 flex items-center">
          <Button
            className="mr-4"
            size="sm"
            type="submit"
            colorSchema="secondary"
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
          >
            {isUpdate ? "Update Credentials" : "Connect to Snowflake"}
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
