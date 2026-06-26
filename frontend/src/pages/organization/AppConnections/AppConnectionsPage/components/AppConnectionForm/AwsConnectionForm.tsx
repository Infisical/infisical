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
import { AwsConnectionMethod, TAwsConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TAwsConnection;
  onSubmit: (formData: FormData) => Promise<void>;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.AWS)
});

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(AwsConnectionMethod.AssumeRole),
    credentials: z.object({
      roleArn: z.string().trim().min(1, "Role ARN required"),
      stsEndpoint: z
        .string()
        .trim()
        .url("Must be a valid URL")
        .startsWith("https://", "Must use HTTPS")
        .or(z.literal(""))
        .optional()
        .transform((val) => val || undefined)
    })
  }),
  rootSchema.extend({
    method: z.literal(AwsConnectionMethod.AccessKey),
    credentials: z.object({
      accessKeyId: z.string().trim().min(1, "Access Key ID required"),
      secretAccessKey: z.string().trim().min(1, "Secret Access Key required")
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const AwsConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection ?? {
      app: AppConnection.AWS,
      method: AwsConnectionMethod.AssumeRole
    }
  });

  const { handleSubmit, control, watch } = form;

  const selectedMethod = watch("method");

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
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
                    {APP_CONNECTION_MAP[AppConnection.AWS].name}. This field cannot be changed after
                    creation.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(AwsConnectionMethod).map((method) => (
                    <SelectItem value={method} key={method}>
                      {getAppConnectionMethodDetails(method).name}
                      {method === AwsConnectionMethod.AssumeRole ? " (Recommended)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        {selectedMethod === AwsConnectionMethod.AssumeRole ? (
          <>
            <Controller
              name="credentials.roleArn"
              control={control}
              shouldUnregister
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel>Role ARN</FieldLabel>
                  <SecretInput value={value} onChange={(e) => onChange(e.target.value)} />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.stsEndpoint"
              control={control}
              shouldUnregister
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel>
                    STS Endpoint URL <span className="text-muted">(optional)</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-md">
                        Override the default AWS STS endpoint Infisical calls to assume the role.
                        Useful for VPC (PrivateLink), GovCloud, China, FIPS, or region-pinned
                        endpoints. Leave blank to use the default AWS STS endpoint.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <Input
                    placeholder="https://sts.amazonaws.com"
                    value={value || ""}
                    onChange={(e) => onChange(e.target.value)}
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </>
        ) : (
          <>
            <Controller
              name="credentials.accessKeyId"
              control={control}
              shouldUnregister
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel>Access Key ID</FieldLabel>
                  <Input
                    placeholder={"*".repeat(20)}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    isError={Boolean(error)}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.secretAccessKey"
              control={control}
              shouldUnregister
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel>Secret Access Key</FieldLabel>
                  <SecretInput value={value} onChange={(e) => onChange(e.target.value)} />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </>
        )}
        <AppConnectionFormFooter submitLabel={isUpdate ? "Update Credentials" : "Connect to AWS"} />
      </form>
    </FormProvider>
  );
};
