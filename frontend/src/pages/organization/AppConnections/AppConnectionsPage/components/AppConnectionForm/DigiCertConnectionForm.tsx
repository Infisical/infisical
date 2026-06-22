import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import {
  Field,
  FieldDescription,
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
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  DigiCertConnectionMethod,
  DigiCertRegion,
  TDigiCertConnection
} from "@app/hooks/api/appConnections/types/digicert-connection";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TDigiCertConnection;
  onSubmit: (formData: FormData) => void;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.DigiCert)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(DigiCertConnectionMethod.ApiKey),
    credentials: z.object({
      apiKey: z.string().trim().min(1, "API Key required"),
      region: z.nativeEnum(DigiCertRegion)
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const DigiCertConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.DigiCert,
      method: DigiCertConnectionMethod.ApiKey,
      credentials: { apiKey: "", region: DigiCertRegion.US }
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
                      APP_CONNECTION_MAP[AppConnection.DigiCert].name
                    }. This field cannot be changed after creation.`}
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger id="method" className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(DigiCertConnectionMethod).map((method) => {
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
          name="credentials.region"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="region">
                CertCentral Region
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    Select the CertCentral tenant your API key was issued in. US and EU are
                    independent. A US key cannot be used against EU and vice-versa.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger id="region" className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a region..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={DigiCertRegion.US}>US</SelectItem>
                  <SelectItem value={DigiCertRegion.EU}>EU</SelectItem>
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
              <FieldLabel htmlFor="api-key">CertCentral API Key</FieldLabel>
              <SecretInput id="api-key" value={value} onChange={(e) => onChange(e.target.value)} />
              {!error && (
                <FieldDescription>
                  Generate an API key in CertCentral under Automation &gt; API Keys.
                </FieldDescription>
              )}
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter
          submitLabel={isUpdate ? "Update Credentials" : "Connect to DigiCert"}
        />
      </form>
    </FormProvider>
  );
};
