import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import {
  Field,
  FieldError,
  FieldLabel,
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
import { DaytonaConnectionMethod, TDaytonaConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TDaytonaConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Daytona)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(DaytonaConnectionMethod.ApiKey),
    credentials: z.object({
      apiKey: z.string().trim().min(1, "API Key required").max(500)
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const DaytonaConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.Daytona,
      method: DaytonaConnectionMethod.ApiKey
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
                    {`The method you would like to use to connect with ${
                      APP_CONNECTION_MAP[AppConnection.Daytona].name
                    }. This field cannot be changed after creation.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger id="method" className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(DaytonaConnectionMethod).map((method) => (
                    <SelectItem value={method} key={method}>
                      {getAppConnectionMethodDetails(method).name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                    Create an API key in Daytona under Settings &gt; API Keys. It must carry the
                    manage:secrets permission, and it determines which Daytona organization secrets
                    are synced to.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <SecretInput id="api-key" value={value} onChange={(e) => onChange(e.target.value)} />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter
          submitLabel={isUpdate ? "Update Credentials" : "Connect to Daytona"}
        />
      </form>
    </FormProvider>
  );
};
