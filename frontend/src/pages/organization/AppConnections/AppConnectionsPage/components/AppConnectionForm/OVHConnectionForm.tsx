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
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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

const formSchema = z.discriminatedUnion("method", [
  rootSchema.extend({
    method: z.literal(OVHConnectionMethod.Certificate),
    credentials: z.object({
      privateKey: pemPrivateKey,
      certificate: pemCertificate,
      okmsDomain: z.string().trim().min(1, "OKMS domain required"),
      okmsId: z.string().trim().min(1, "OKMS ID required")
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
            privateKey: "",
            certificate: ""
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

  const { handleSubmit, control } = form;

  return (
    <FormProvider {...form}>
      <form onSubmit={handleSubmit(onSubmit)}>
        {!isUpdate && <GenericAppConnectionsFields />}
        <Controller
          name="method"
          control={control}
          render={({ field }) => (
            <input type="hidden" {...field} value={OVHConnectionMethod.Certificate} />
          )}
        />
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
                    Paste the PEM-encoded private key issued by OVH OKMS, including the
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
                    Paste the PEM-encoded public certificate issued by OVH OKMS, including the
                    -----BEGIN/END CERTIFICATE----- markers.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <SecretInput value={value} onChange={(e) => onChange(e.target.value)} />
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <Controller
          name="credentials.okmsDomain"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel htmlFor="okms-domain">
                OKMS Domain
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    The OKMS base URL, e.g. &apos;https://ca-east-bhs.okms.ovh.net&apos;.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Input
                id="okms-domain"
                {...field}
                placeholder="https://ca-east-bhs.okms.ovh.net"
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
              <FieldLabel htmlFor="okms-id">OKMS ID</FieldLabel>
              <Input
                id="okms-id"
                {...field}
                placeholder="your-okms-instance-id"
                isError={Boolean(error?.message)}
              />
              {!error && (
                <FieldDescription>
                  Your OKMS instance identifier from the OVH Control Panel.
                </FieldDescription>
              )}
              <FieldError errors={[error]} />
            </Field>
          )}
        />
        <AppConnectionFormFooter submitLabel={isUpdate ? "Update Credentials" : "Connect to OVH"} />
      </form>
    </FormProvider>
  );
};
