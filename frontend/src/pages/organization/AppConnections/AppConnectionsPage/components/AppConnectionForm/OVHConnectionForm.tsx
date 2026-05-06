import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, ModalClose, SecretInput } from "@app/components/v2";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import {
  OVHConnectionMethod,
  TOvhConnection
} from "@app/hooks/api/appConnections/types/ovh-connection";

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
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Private Key (PEM)"
              tooltipText="Paste the PEM-encoded private key issued by OVH OKMS, including the -----BEGIN/END PRIVATE KEY----- markers."
            >
              <SecretInput
                containerClassName="text-gray-400 group-focus-within:border-primary-400/50! border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
            </FormControl>
          )}
        />
        <Controller
          name="credentials.certificate"
          control={control}
          shouldUnregister
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Certificate (PEM)"
              tooltipText="Paste the PEM-encoded public certificate issued by OVH OKMS, including the -----BEGIN/END CERTIFICATE----- markers."
            >
              <SecretInput
                containerClassName="text-gray-400 group-focus-within:border-primary-400/50! border border-mineshaft-500 bg-mineshaft-900 px-2.5 py-1.5"
                value={value}
                onChange={(e) => onChange(e.target.value)}
              />
            </FormControl>
          )}
        />
        <Controller
          name="credentials.okmsDomain"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="OKMS Domain"
              tooltipText="The OKMS base URL, e.g. 'https://ca-east-bhs.okms.ovh.net'."
            >
              <Input {...field} placeholder="https://ca-east-bhs.okms.ovh.net" />
            </FormControl>
          )}
        />
        <Controller
          name="credentials.okmsId"
          control={control}
          shouldUnregister
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="OKMS ID"
              helperText="Your OKMS instance identifier from the OVH Control Panel."
            >
              <Input {...field} placeholder="your-okms-instance-id" />
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
            {isUpdate ? "Update Credentials" : "Connect to OVH"}
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
