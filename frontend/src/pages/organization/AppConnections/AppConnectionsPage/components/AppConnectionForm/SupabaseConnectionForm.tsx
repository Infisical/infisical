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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { APP_CONNECTION_MAP, getAppConnectionMethodDetails } from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  SupabaseConnectionMethod,
  TSupabaseConnection
} from "@app/hooks/api/appConnections/types/supabase-connection";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TSupabaseConnection;
  onSubmit: (formData: FormData) => void;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Supabase)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(SupabaseConnectionMethod.AccessToken),
    credentials: z.object({
      accessKey: z.string().trim().min(1, "Access Key required"),
      instanceUrl: z.string().url().optional()
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const SupabaseConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.Supabase,
      method: SupabaseConnectionMethod.AccessToken
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
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="instance-url">
                Instance URL <span className="text-muted">(optional)</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    Will default to Supabase Cloud if not specified.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="instance-url"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder="https://api.supabase.com"
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
              <FieldLabel htmlFor="method">
                Token Type
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The type of token you would like to use to connect with{" "}
                    {APP_CONNECTION_MAP[AppConnection.Supabase].name}. This field cannot be changed
                    after creation.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(SupabaseConnectionMethod).map((method) => {
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
        <Controller
          name="credentials.accessKey"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="access-key">Access Key Value</FieldLabel>
              <SecretInput
                id="access-key"
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />

        <AppConnectionFormFooter
          submitLabel={isUpdate ? "Update Credentials" : "Connect to Supabase"}
        />
      </form>
    </FormProvider>
  );
};
