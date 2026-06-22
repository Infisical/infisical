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
  DatabricksConnectionMethod,
  TDatabricksConnection
} from "@app/hooks/api/appConnections/types/databricks-connection";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TDatabricksConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Databricks)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(DatabricksConnectionMethod.ServicePrincipal),
    credentials: z.object({
      workspaceUrl: z.string().url().trim().min(1, "Workspace URL required"),
      clientId: z.string().trim().min(1, "Client ID required"),
      clientSecret: z.string().trim().min(1, "Client secret required")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const DatabricksConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.Databricks,
      method: DatabricksConnectionMethod.ServicePrincipal
    }
  });

  const { handleSubmit, control } = form;

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}
        <Controller
          name="method"
          control={control}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="method">
                Method
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The method you would like to use to connect with{" "}
                    {APP_CONNECTION_MAP[AppConnection.Databricks].name}. This field cannot be
                    changed after creation.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(DatabricksConnectionMethod).map((method) => {
                    return (
                      <SelectItem value={method} key={method}>
                        {getAppConnectionMethodDetails(method).name}
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
          name="credentials.workspaceUrl"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="workspace-url">Workspace URL</FieldLabel>
              <Input
                id="workspace-url"
                {...field}
                placeholder="https://xxx-xxxxxxxx-xxx.cloud.databricks.com"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.clientId"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="client-id">Client ID</FieldLabel>
              <Input
                id="client-id"
                {...field}
                placeholder="05810c8f-c44d-4bd0-a327-aab6dd77719b"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.clientSecret"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="client-secret">Client Secret</FieldLabel>
              <SecretInput value={value} onChange={(e) => onChange(e.target.value)} />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter
          submitLabel={isUpdate ? "Update Credentials" : "Connect to Databricks"}
        />
      </form>
    </FormProvider>
  );
};
