import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { z } from "zod";

import {
  Field,
  FieldDescription,
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
  OVHConnectionMethod,
  TOvhConnection
} from "@app/hooks/api/appConnections/types/ovh-connection";

import { AppConnectionFormFooter } from "./AppConnectionFormFooter";
import {
  genericAppConnectionFieldsSchema,
  GenericAppConnectionsFields
} from "./GenericAppConnectionFields";

type Props = {
  appConnection?: TOvhConnection;
  onSubmit: (formData: FormData) => void;
};

const rootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.OVH)
});

const pemPrivateKey = z
  .string()
  .trim()
  .min(1, "Private key required")
  .refine((val) => val.startsWith("-----BEGIN "), {
    message: "Private key must be in PEM format (starts with -----BEGIN ...-----)"
  });

const pemCertificate = z
  .string()
  .trim()
  .min(1, "Certificate required")
  .refine((val) => val.startsWith("-----BEGIN CERTIFICATE-----"), {
    message: "Certificate must be in PEM format (starts with -----BEGIN CERTIFICATE-----)"
  });

const okmsDomain = z
  .string()
  .trim()
  .min(1, "KMS rest API endpoint required")
  .url("KMS rest API endpoint must be a valid URL (e.g. https://eu-west-rbx.okms.ovh.net)")
  .refine((val) => val.startsWith("https://"), {
    message: "KMS rest API endpoint must use https"
  });
const okmsId = z.string().trim().min(1, "KMS ID required");

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(OVHConnectionMethod.Certificate),
    credentials: z.object({
      privateKey: pemPrivateKey,
      certificate: pemCertificate,
      okmsDomain,
      okmsId
    })
  }),
  rootSchema.extend({
    method: z.literal(OVHConnectionMethod.Token),
    credentials: z.object({
      token: z.string().trim().min(1, "Token required"),
      okmsDomain,
      okmsId
    })
  })
]);

type FormData = z.infer<typeof formSchema>;

export const OVHConnectionForm = ({ appConnection, onSubmit }: Props) => {
  const isUpdate = Boolean(appConnection);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: appConnection
      ? {
          ...appConnection,
          credentials: {
            ...appConnection.credentials,
            ...(appConnection.method === OVHConnectionMethod.Certificate
              ? { privateKey: "", certificate: "" }
              : { token: "" })
          }
        }
      : {
          app: AppConnection.OVH,
          method: OVHConnectionMethod.Certificate,
          credentials: {
            privateKey: "",
            certificate: "",
            okmsDomain: "",
            okmsId: ""
          }
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
                    {APP_CONNECTION_MAP[AppConnection.OVH].name}. This field cannot be changed after
                    creation.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Select disabled={isUpdate} value={value} onValueChange={(val) => onChange(val)}>
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a method..." />
                </SelectTrigger>
                <SelectContent position="popper">
                  {Object.values(OVHConnectionMethod).map((method) => (
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
        {selectedMethod === OVHConnectionMethod.Certificate ? (
          <>
            <Controller
              name="credentials.privateKey"
              control={control}
              shouldUnregister
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="private-key">
                    Private Key (PEM)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        Paste the PEM-encoded private key issued by OVHcloud KMS, including the
                        -----BEGIN/END PRIVATE KEY----- markers.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <SecretInput value={value} onChange={(e) => onChange(e.target.value)} />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
            <Controller
              name="credentials.certificate"
              control={control}
              shouldUnregister
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel htmlFor="certificate">
                    Certificate (PEM)
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        Paste the PEM-encoded public certificate issued by OVHcloud KMS, including
                        the -----BEGIN/END CERTIFICATE----- markers.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <SecretInput value={value} onChange={(e) => onChange(e.target.value)} />
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </>
        ) : (
          <Controller
            name="credentials.token"
            control={control}
            shouldUnregister
            render={({ field: { value, onChange }, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel htmlFor="token">
                  Token
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      Paste the OVHcloud access token.
                    </TooltipContent>
                  </Tooltip>
                </FieldLabel>
                <SecretInput value={value} onChange={(e) => onChange(e.target.value)} />
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        )}
        <Controller
          name="credentials.okmsDomain"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="okms-domain">
                Rest API endpoint
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The OVHcloud KMS base URL, e.g. &apos;https://eu-west-rbx.okms.ovh.net&apos;.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="okms-domain"
                {...field}
                placeholder="https://eu-west-rbx.okms.ovh.net"
                isError={Boolean(error?.message)}
              />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.okmsId"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="okms-id">KMS ID</FieldLabel>
              <Input
                id="okms-id"
                {...field}
                placeholder="your-kms-instance-id"
                isError={Boolean(error?.message)}
              />
              {!error && (
                <FieldDescription>
                  Your KMS instance identifier from OVHcloud Control Panel.
                </FieldDescription>
              )}
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter
          submitLabel={isUpdate ? "Update Credentials" : "Connect to OVHcloud"}
        />
      </form>
    </FormProvider>
  );
};
