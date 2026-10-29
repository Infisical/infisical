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
  KeeperConnectionMethod,
  TKeeperConnection
} from "@app/hooks/api/appConnections/types/keeper-connection";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TKeeperConnection;
  onSubmit: (formData: FormData) => void;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Keeper)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(KeeperConnectionMethod.ApiKey),
    credentials: z.object({
      instanceUrl: z
        .string()
        .trim()
        .url("Invalid Instance URL")
        .min(1, "Instance URL required")
        .max(255),
      apiKey: z.string().trim().min(1, "API Key required").max(500)
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const KeeperConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.Keeper,
      method: KeeperConnectionMethod.ApiKey
    }
  });

  const { handleSubmit, control } = form;

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}
        <Controller
          name="credentials.instanceUrl"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="instance-url">
                Instance URL
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The URL of your Keeper Commander instance (e.g., https://keeper.company.com).
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="instance-url"
                {...field}
                placeholder="https://keeper.company.com"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.apiKey"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="api-key">
                API Key
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The API key generated for Keeper Commander Service Mode.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <SecretInput
                aria-describedby={error ? "api-key-error" : undefined}
                id="api-key"
                isError={Boolean(error)}
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
              <FieldError id="api-key-error" errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter
          submitLabel={isUpdate ? "Update Credentials" : "Connect to Keeper"}
        />
      </form>
    </FormProvider>
  );
};
